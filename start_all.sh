#!/bin/bash
# يشغّل الخادم + نفق Cloudflare العام معًا
cd /home/user/livechat
pkill -f "node server.js" 2>/dev/null
pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1
nohup node server.js > /home/user/livechat/server.log 2>&1 &
sleep 2
nohup /tmp/cloudflared tunnel --url http://127.0.0.1:3000 > /home/user/livechat/tunnel.log 2>&1 &
sleep 6
grep -o 'https://[a-zA-Z0-9.-]*trycloudflare.com' /home/user/livechat/tunnel.log | head -1
