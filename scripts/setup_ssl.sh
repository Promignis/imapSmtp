#!/bin/sh

if ! [ -d /etc/letsencrypt ]; then
  sudo apt -y install letsencrypt
  sudo letsencrypt certonly --standalone -d $DOMAIN -d $(echo "smtp.$DOMAIN") -m $(echo $EMAIL) --agree-tos --non-interactive
fi
