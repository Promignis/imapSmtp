#!/bin/bash

bg=0

if [[ $1 == "--bg" ]]
then
    bg=1
fi
# Stop old services
if [ "$PROCESS_NAME" == "" ]
then
    echo "No or Empty PROCESS_NAME env variable."
    echo "Please set the correct env variables and then try again"
else
    echo "Getting any previously running services"
    process=`pidof "$PROCESS_NAME"`
    if [ "$process" == "" ]
    then
        echo "No previously running services"
    else
        echo "$process"
        echo "Killing Previously running services..."
        sudo killall $PROCESS_NAME
        echo "Previously running services killed"
    fi

    export TEST=ttt
    # build and start
    echo "Starting services ($NODE_ENV)"
    echo "$bg"
    if [ $bg == 1 ]
    then
        echo "Starting in background."
        sudo -E npm run start & exit
    else
        sudo -E npm run start
    fi
fi

