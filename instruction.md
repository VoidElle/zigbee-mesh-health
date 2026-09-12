# Mesh Health — Specifica tecnica per agente di sviluppo

## 1. Obiettivo del progetto

Costruire un servizio self-hosted che monitora nel tempo la salute di una rete Zigbee gestita da Zigbee2MQTT (Z2M), storicizzando la link quality (LQI) e i fallimenti di routing/delivery, per individuare trend di degrado prima che un dispositivo o il coordinatore smettano di funzionare.

Vincolo di fondo: il monitoraggio continuo non deve mai generare traffico Zigbee aggiuntivo (vedi sezione 2).

## 2. Vincolo critico — non violare

Il comando `zigbee2mqtt/bridge/request/networkmap` esegue una scansione LQI attiva: interroga in sequenza tutti i router della mesh, genera traffico radio aggiuntivo, e può richiedere diversi minuti con possibili fallimenti parziali su reti instabili.

- Non chiamare mai questo comando più di 1-2 volte al giorno.
- Mai in un loop di polling frequente, anche in fase di debug.
- Il monitoraggio continuo deve basarsi esclusivamente sui canali passivi (sezione 3.1 e 3.3).

## 3. Architettura — tre canali dati separati

### 3.1 Canale 1 — Link quality passiva (continua, costo zero)

Ogni messaggio pubblicato da un dispositivo Zigbee su MQTT include già l'attributo `linkquality` nel payload.

Come deve essere fatto:
- Sottoscriversi al topic `<base_topic>/+` (default `zigbee2mqtt/+`)
- Per ogni messaggio: parse del payload JSON; se contiene `linkquality`, estrarre `friendly_name` (dal topic), `linkquality`, timestamp di ricezione
- Escludere esplicitamente i topic `bridge/#` da questa pipeline (gestiti nel canale 3)
- Scrittura a batch (non una insert per messaggio): accumulare in memoria e fare flush su storage ogni N secondi (default 10s) o M campioni, per non stressare SQLite con scritture singole ad alta frequenza

### 3.2 Canale 2 — Networkmap attiva (rara, on-demand)

- Scheduler configurabile, default: 1 esecuzione/giorno a un orario configurabile (default 04:00, ora a basso traffico)
- Pubblicare su `zigbee2mqtt/bridge/request/networkmap` payload `"raw"`
- Ascoltare la risposta su `zigbee2mqtt/bridge/response/networkmap` con timeout (default 3 minuti); se timeout, loggare fallimento e riprovare al giro successivo, non ritentare subito
- Esporre anche un trigger manuale (endpoint API) per richiederla on-demand, con un rate limit lato server (minimo 1 ora tra due richieste manuali) per impedire abusi accidentali
- Salvare lo snapshot completo con timestamp; usarlo solo per la vista grafica, mai come fonte per il trend continuo

### 3.3 Canale 3 — Log/eventi di Z2M (continuo, leggero)

- Sottoscriversi a `zigbee2mqtt/bridge/logging`
- Filtrare e salvare: route/delivery failure, dispositivi che lasciano la rete (leave), errori di publish, restart del bridge
- Sottoscriversi anche a `zigbee2mqtt/bridge/info` per rilevare cambi di versione Z2M/coordinatore e loggarli come evento di sistema (usato per correlazione in sezione 6)

## 4. Storage

MVP: SQLite, singolo file, zero dipendenze esterne da gestire.

Schema:

```sql
CREATE TABLE linkquality_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_name TEXT NOT NULL,
  ieee_address TEXT,
  lqi INTEGER NOT NULL,
  ts DATETIME NOT NULL
);
CREATE INDEX idx_lqi_device_ts ON linkquality_samples(device_name, ts);

CREATE TABLE network_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts DATETIME NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE TABLE log_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts DATETIME NOT NULL,
  event_type TEXT NOT NULL, -- 'route_failure' | 'delivery_failure' | 'device_leave' | 'bridge_restart' | 'version_change' | 'other'
  device_name TEXT,
  message TEXT
);
CREATE INDEX idx_events_type_ts ON log_events(event_type, ts);
```

Retention: aggiungere un job di pulizia che aggrega/elimina i campioni di `linkquality_samples` più vecchi di N giorni (default 30) in una tabella `linkquality_daily_summary` (min/max/avg per device/giorno), per evitare crescita illimitata del database.

## 5. Stack tecnologico

Progetto interamente in **Node.js**, per coerenza con l'ecosistema di Zigbee2MQTT (stesso linguaggio, stessi pattern asincroni per MQTT, un solo runtime da mantenere per un progetto personale gestito in autonomia).

- **Backend/raccolta dati**: Node.js, libreria `mqtt` (npm) per la sottoscrizione ai topic, `express` per l'API REST
- **Storage**: `better-sqlite3` (accesso sincrono, adatto a un servizio single-process come questo)
- **Frontend**: HTML/CSS/JS vanilla servito come file statici dallo stesso processo Express — nessun framework, nessun build step
- **Scheduler networkmap**: libreria leggera di cron in-process (es. `node-cron`), non un cron di sistema esterno

## 6. Backend — API

Un piccolo servizio HTTP Express che espone:

- `GET /api/devices` — lista dispositivi noti, con LQI corrente e stato alert (ok / warning / critical)
- `GET /api/devices/{name}/history?range=24h|7d|30d` — serie temporale LQI per un dispositivo
- `GET /api/events?type=&since=` — lista eventi/log, filtrabili per tipo e finestra temporale
- `GET /api/network/latest` — ultimo snapshot networkmap disponibile (nodi + archi + LQI)
- `POST /api/network/refresh` — trigger manuale networkmap (soggetto al rate limit di sezione 3.2)
- `GET /api/health` — stato del servizio stesso (connessione MQTT attiva, ultimo campione ricevuto, ultima networkmap riuscita)

Tutte le risposte in JSON. Nessuna autenticazione complessa richiesta per la v1 (si assume rete locale/homelab), ma predisporre un middleware per una API key opzionale via variabile d'ambiente, disattivabile.

## 7. Logica di analisi

- Per ogni dispositivo, calcolare due medie mobili sul campo `lqi`: finestra breve (24h) e finestra lunga (7 giorni)
- Stato `warning`: media 24h inferiore alla media 7 giorni di più di una soglia percentuale configurabile (default 20%)
- Stato `critical`: media 24h sotto una soglia assoluta configurabile (default LQI 50) oppure più di N route/delivery failure nelle ultime 24h (default N=5)
- Stato `ok`: nessuna delle condizioni sopra
- Nessun machine learning nella v1: soglie statiche, tutte configurabili via variabili d'ambiente o file di config, con default sensati documentati nel README

## 8. Frontend — design e resa grafica

### 8.1 Direzione concettuale

Il pubblico è un utente tecnico singolo (l'homelabber stesso), non un cliente enterprise: l'interfaccia deve somigliare più a uno strumento da banco di un tecnico RF/rete (analizzatore di spettro, oscilloscopio, monitor di rete) che a una dashboard SaaS generica. Evitare esplicitamente: sfondo crema con accento terracotta, card arrotondate identiche con ombra grigia uniforme, eyebrow label in maiuscolo, badge con puntini medi.

### 8.2 Token di design

**Colore — base grafite/tecnica, non SaaS:**
- `--bg-base: #14171A` (sfondo principale, quasi nero ma non puro)
- `--bg-panel: #1C2024` (pannelli/card)
- `--border: #2A2F35` (separatori, hairline)
- `--text-primary: #E4E7EA`
- `--text-muted: #8B939B`
- `--status-ok: #4FB477` (verde spento, non neon)
- `--status-warning: #D9A441` (ambra, come i LED di stato su hardware di rete)
- `--status-critical: #C1533E` (rosso mattone, non rosso semaforico puro)

**Tipografia — due famiglie distinte:**
- UI/testo generale: sans neutro leggibile (es. Inter o IBM Plex Sans)
- Dati numerici, LQI, timestamp, indirizzi IEEE: monospace (es. IBM Plex Mono o JetBrains Mono) — i numeri che cambiano nel tempo vanno sempre in monospace per leggibilità e per dare un'identità "da strumento" all'interfaccia
- Scala tipografica contenuta: 1 dimensione per titoli di pagina, 1 per titoli di sezione, 1 per corpo/dati, 1 per etichette secondarie — evitare gerarchie eccessive

**Layout:**
- Struttura a due colonne su desktop: sidebar sinistra stretta e fissa con lista dispositivi (nome + pallino di stato colorato + LQI corrente in monospace), pannello principale a destra con il dettaglio del dispositivo selezionato
- Su mobile: sidebar diventa una lista a tutta larghezza, tap su un dispositivo porta al dettaglio (navigazione a due livelli, non tutto su una schermata)
- Allineamento a sinistra ovunque, niente centratura di blocchi di testo/dati

ASCII wireframe (desktop):
```
+------------------+--------------------------------------------+
| MESH HEALTH       | Soggiorno - Sensore Porta                  |
|--------------------|--------------------------------------------|
| o Cucina - Sensore | LQI attuale: 187        stato: ok          |
|   LQI 187          |                                            |
| o Soggiorno - Porta| [ grafico storico LQI 24h/7g/30g ]         |
|   LQI 62  (warn)   |                                            |
| o Bagno - Valvola  | Eventi recenti:                            |
|   LQI 201          |  - route failure  12:04                    |
| ...                |  - device rejoined 09:41                   |
|--------------------|--------------------------------------------|
| [ Mappa di rete ]  | (tab separata: ultimo snapshot networkmap) |
+------------------+--------------------------------------------+
```

### 8.3 Pagine/viste richieste

1. **Vista lista dispositivi** (sidebar sempre visibile su desktop): nome, indicatore di stato a colore, LQI corrente in monospace, ordinabile per stato (critical prima)
2. **Vista dettaglio dispositivo**: grafico a linea dell'andamento LQI (selettore 24h/7g/30g), elenco eventi recenti relativi a quel dispositivo, indirizzo IEEE
3. **Vista mappa di rete**: rendering dell'ultimo snapshot networkmap (nodi = dispositivi, archi = collegamenti con LQI come spessore o colore dell'arco), con timestamp ben visibile di quando è stato preso lo snapshot, e pulsante per richiederne uno nuovo (che mostra chiaramente che l'operazione è pesante e rara, es. testo "Aggiorna mappa (operazione lenta, max 1/ora)")
4. **Vista eventi**: log filtrabile per tipo, utile per correlare un peggioramento con un aggiornamento firmware o un riavvio

### 8.4 Componenti e comportamento

- Il grafico storico LQI: linea singola per device selezionato, area colorata leggera sotto la soglia di warning/critical per rendere visivamente immediato quando il dispositivo è entrato in stato di allerta, senza bisogno di leggere numeri
- Indicatori di stato: un singolo pallino colorato (non badge testuali multipli) per ogni device nella lista — il colore è l'informazione, non serve testo aggiuntivo ripetuto ovunque
- Nessuna animazione decorativa; unica animazione accettabile: transizione morbida quando il grafico si aggiorna con nuovi dati o quando si cambia range temporale
- Stato vuoto (nessun dato ancora raccolto): messaggio chiaro tipo "Ancora nessun campione raccolto per questo dispositivo" invece di un grafico vuoto silenzioso
- Focus da tastiera visibile su tutti gli elementi interattivi; contrasto colori verificato leggibile sullo sfondo scuro

### 8.5 Librerie grafiche consigliate

- Grafici a linea temporali: libreria JS leggera (es. Chart.js), caricata come file statico, nessuna dipendenza da build tool
- Mappa di rete: rendering a grafo semplice via SVG generato lato client (nodi/archi, spessore o colore dell'arco proporzionale a LQI), senza librerie di grafo complesse per la v1

## 9. Deploy

- Container Docker separato, configurabile via variabili d'ambiente:
    - `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`
    - `Z2M_BASE_TOPIC` (default `zigbee2mqtt`)
    - `NETWORKMAP_SCHEDULE` (default `04:00` giornaliero)
    - `LQI_WARNING_THRESHOLD_PCT` (default 20)
    - `LQI_CRITICAL_ABSOLUTE` (default 50)
    - `ROUTE_FAILURE_CRITICAL_COUNT` (default 5)
    - `RETENTION_DAYS` (default 30)
    - `API_KEY` (opzionale, vuoto = disabilitata)
- Fornire un `docker-compose.yml` di esempio pronto all'uso
- Nessuna dipendenza cloud: tutto deve girare in locale sulla rete dell'utente

## 10. Fuori scope per la v1

- Correlazione automatica intelligente con aggiornamenti firmware/Z2M (per ora solo log manuale dell'evento in tabella `log_events`)
- Notifiche push (l'integrazione con le notifiche di Home Assistant può essere un secondo step, non v1)
- Supporto multi-rete/multi-coordinatore
- Autenticazione multi-utente

## 11. Deliverable atteso dall'agente

1. Struttura del progetto Node.js (servizio raccolta dati + storage + API + frontend statico)
2. Script/servizio di raccolta dati per i tre canali, con il canale networkmap chiaramente isolato e schedulato come da sezione 3.2
3. Implementazione API Express come da sezione 6
4. Frontend con le quattro viste della sezione 8.3, seguendo i token di design della sezione 8.2
5. `docker-compose.yml` e istruzioni di deploy
6. README che spiega i tre canali dati, perché il networkmap va richiesto raramente, e come configurare le soglie di alert