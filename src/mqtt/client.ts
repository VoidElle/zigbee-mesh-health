import * as mqtt from 'mqtt';
import { config } from '../config';
import { runtimeStatus } from '../runtime';

let client: mqtt.MqttClient | null = null;

export function getClient(): mqtt.MqttClient {
  if (client) return client;
  client = mqtt.connect({
    host: config.mqttHost,
    port: config.mqttPort,
    ...(config.mqttUsername !== undefined ? { username: config.mqttUsername } : {}),
    ...(config.mqttPassword !== undefined ? { password: config.mqttPassword } : {}),
  });
  // Read-only channel: this client never publishes (spec §2/§3.1).
  // Connectivity tracked for /api/health.
  client.on('connect', () => {
    runtimeStatus.mqttConnected = true;
  });
  client.on('reconnect', () => {
    runtimeStatus.mqttConnected = false;
  });
  client.on('close', () => {
    runtimeStatus.mqttConnected = false;
  });
  client.on('offline', () => {
    runtimeStatus.mqttConnected = false;
  });
  client.on('error', (err) => {
    console.error(`[mqtt] ${err.message}`);
  });
  return client;
}
