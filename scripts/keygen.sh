#!/bin/sh

# output of the script is
# the public key to be used for git
# clone

# any line fails script exits
set -e

# this is run after
# secure_user.sh has run

SSH_KEYNAME=$1

if [ -z $1 ]; then
  SSH_KEYNAME=bizgazemail
fi

# not putting passphrase
# passphrase from stdin is a real pain
ssh-keygen -t rsa -b 4096 -N "" -f $SSH_KEYNAME -q
sudo mv $SSH_KEYNAME ~/.ssh/
sudo mv $SSH_KEYNAME.pub ~/.ssh/

# Add ssh config
sudo cat <<EOF > ~/.ssh/config
Host bitbucket.org
  IdentityFile ~/.ssh/$SSH_KEYNAME
  StrictHostKeyChecking no
EOF

# ssh config for ignislib
sudo cat <<EOF > ~/.gitconfig
[url "git@bitbucket.org:"]
        insteadOf = https://bitbucket.org/
EOF

# final output back
sudo cat ~/.ssh/$(echo "$SSH_KEYNAME.pub")
