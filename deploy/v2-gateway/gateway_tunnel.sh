#!/bin/sh
# Reverse tunnel: this gateway host -> production.
#
# The production backend is the client of the gateway, but production cannot
# open a connection into a home NAT. So this host dials out and asks sshd on the
# production box to listen on the compose network's gateway address; a container
# on ``speaking_default`` then reaches the adapter at that address.
#
#   prod backend ──► <compose-gw-ip>:4400 ──ssh -R──► 127.0.0.1:4400 (adapter)
#
# Requirements on the production host (see README.md, "独立网关主机"):
#   * a dedicated account whose authorized_keys line carries
#     restrict,port-forwarding,permitlisten="<compose-gw-ip>:4400"
#   * a Match block for that account with AllowTcpForwarding remote and
#     GatewayPorts clientspecified
# Nothing else on the host gains remote forwarding.
#
# Reconnects forever; run it under NSSM / systemd so it survives reboots.
set -u

PROD_HOST=${PROD_HOST:-47.122.109.52}
TUNNEL_USER=${TUNNEL_USER:-gwtunnel}
KEY=${GATEWAY_TUNNEL_KEY:-$HOME/.ssh/gw_tunnel_ed25519}
LISTEN_PORT=${GATEWAY_ADAPTER_PORT:-4400}
LOCAL_PORT=${GATEWAY_ADAPTER_PORT:-4400}
ADMIN_KEY=${GATEWAY_ADMIN_KEY:-$HOME/.ssh/id_ed25519}

if [ ! -f "$KEY" ]; then
  echo "tunnel key not found: $KEY" >&2
  exit 1
fi

# What a container on speaking_default can reach on the host. Recomputed on
# every reconnect because it changes if the compose network is recreated.
resolve_listen_ip() {
  if [ -n "${GATEWAY_LISTEN_IP:-}" ]; then
    echo "$GATEWAY_LISTEN_IP"
    return
  fi
  ip=$(ssh -o BatchMode=yes -o ConnectTimeout=10 -i "$ADMIN_KEY" "root@$PROD_HOST" \
    'docker network inspect speaking_default --format "{{(index .IPAM.Config 0).Gateway}}"' 2>/dev/null | tr -d '\r')
  case "$ip" in
    [0-9]*.[0-9]*.[0-9]*.[0-9]*) echo "$ip" ;;
    *) echo 172.19.0.1 ;;
  esac
}

while :; do
  LISTEN_IP=$(resolve_listen_ip)
  ts=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$ts][tunnel] ssh -R $LISTEN_IP:$LISTEN_PORT:127.0.0.1:$LOCAL_PORT -> $TUNNEL_USER@$PROD_HOST"
  ssh -N \
    -R "$LISTEN_IP:$LISTEN_PORT:127.0.0.1:$LOCAL_PORT" \
    -i "$KEY" \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -o StrictHostKeyChecking=accept-new \
    "$TUNNEL_USER@$PROD_HOST"
  ts=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$ts][tunnel] ssh exited ($?); reconnecting in 5s"
  sleep 5
done
