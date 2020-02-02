#!/bin/sh

# kept for reference for now


set -e

bizgaze_path=~/app/bizgaze-mail

sudo apt-get update
sudo apt-get install build-essential tcl

cd /tmp
curl -O http://download.redis.io/redis-stable.tar.gz
tar xzvf redis-stable.tar.gz
cd redis-stable
make
make test
sudo make install

if [ -d /etc/redis ]; then
  sudo mkdir /etc/redis
fi

# sudo cp /tmp/redis-stable/redis.conf /etc/redis
cp "$bizgaze_path/scripts/redis.conf" /etc/redis/.
