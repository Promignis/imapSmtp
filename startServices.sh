#!/bin/bash

# Stop old services
sudo killall $PROCESS_NAME

# Add enviornment variables
source env.sh

# build and start
sudo -E npm run start
