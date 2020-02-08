#!/bin/sh

# app related installations

NODEJS=1
HARAKA=1

if [ $NODEJS -eq 1 ]; then
  echo "Installing nodejs"
  curl -sL https://deb.nodesource.com/setup_13.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if [ $HARAKA -eq 1 ]; then
  echo "Installing haraka"
  sudo apt-get install -y gyp
  sudo apt-get install -y make
  sudo apt-get install -y g++
  sudo npm --silent i -g Haraka --unsafe-perm=true
fi
