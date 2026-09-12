#!/usr/bin/with-contenv bashio

export DATA_DIR=/data

# Broker: explicit options win over the HA MQTT service
if bashio::config.has_value 'mqtt_host'; then
  export MQTT_HOST="$(bashio::config 'mqtt_host')"
  export MQTT_PORT="$(bashio::config 'mqtt_port')"
  bashio::config.has_value 'mqtt_username' && export MQTT_USERNAME="$(bashio::config 'mqtt_username')"
  bashio::config.has_value 'mqtt_password' && export MQTT_PASSWORD="$(bashio::config 'mqtt_password')"
elif bashio::services.available "mqtt"; then
  export MQTT_HOST="$(bashio::services 'mqtt' 'host')"
  export MQTT_PORT="$(bashio::services 'mqtt' 'port')"
  export MQTT_USERNAME="$(bashio::services 'mqtt' 'username')"
  export MQTT_PASSWORD="$(bashio::services 'mqtt' 'password')"
else
  bashio::exit.nok "No MQTT broker: connect the Mosquitto broker add-on or set mqtt_host"
fi

export Z2M_BASE_TOPIC="$(bashio::config 'base_topic')"
export NETWORKMAP_SCHEDULE="$(bashio::config 'networkmap_schedule')"
export LQI_WARNING_THRESHOLD_PCT="$(bashio::config 'lqi_warning_threshold_pct')"
export LQI_CRITICAL_ABSOLUTE="$(bashio::config 'lqi_critical_absolute')"
export ROUTE_FAILURE_CRITICAL_COUNT="$(bashio::config 'route_failure_critical_count')"
export RETENTION_DAYS="$(bashio::config 'retention_days')"
export HTTP_PORT=8080   # must equal ingress_port in config.yaml

bashio::config.has_value 'api_key' && export API_KEY="$(bashio::config 'api_key')"

bashio::log.info "Starting zigbee-mesh-health (broker ${MQTT_HOST}:${MQTT_PORT}, topic ${Z2M_BASE_TOPIC})"
exec node dist/index.js
