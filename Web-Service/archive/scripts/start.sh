#!/bin/sh

echo "Starting HandPose Web Service..."
echo "================================"

# Start supervisor which will manage all services
exec /usr/bin/supervisord -c /etc/supervisord.conf
