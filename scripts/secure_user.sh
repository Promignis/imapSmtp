#!/bin/sh

# config
USER=1
SSH=1
LOGS=1
FIREWALL=1

NEWUSER=bizgazemail

if [ 1 -eq $USER ]; then
  # create bizgazemail user
  adduser --shell /bin/bash --disabled-password $NEWUSER --gecos ""

  # add to sudoers group
  usermod -aG sudo $NEWUSER
fi

# this is dangerous but fine for now here
# allows no password sudo use for NEWUSER
# TODO: do this well
 echo "$NEWUSER ALL=(ALL) NOPASSWD:ALL" | sudo tee -a /etc/sudoers

if [ 1 -eq $LOGS ]; then
  logs_path=/home/$NEWUSER/log
  install_log_path="$logs_path/install_log"
  mkdir -p $logs_path
  touch $install_log_path
  sudo chown $NEWUSER:root $install_log_path
fi


if [ 1 -eq $SSH ]; then
  # Allow ignis user to be
  # sshd in via this public key
  su - $NEWUSER -c "mkdir ~/.ssh"
  su - $NEWUSER -c "chmod 700 ~/.ssh"
  su - $NEWUSER -c "sudo cp /root/.ssh/authorized_keys ~/.ssh/authorized_keys"
  su - $NEWUSER -c "sudo chown -R $NEWUSER ~/.ssh"

  # disable password authentication
  # only allow ssh
  # turns existing no to a yes
  # also saves a backup there
  # with the date
  sudo sed -re 's/^(PasswordAuthentication)([[:space:]]+)yes/\1\2no/' -i.`date -I` /etc/ssh/sshd_config >> $install_log_path 2>&1
  # don't allow login via root
  sudo sed -re 's/^(PermitRootLogin)([[:space:]]+)yes/\1\2no/' -i.`date -I` /etc/ssh/sshd_config >> $install_log_path 2>&1
  sudo systemctl reload sshd >> $install_log_path 2>&1
fi

if [ 1 -eq $FIREWALL ]; then
  # secure defaults
  sudo ufw default deny incoming
  sudo ufw default allow outgoing

  # regular mail server
  echo "port 25 for mail server" >> $install_log_path
  sudo ufw allow 25/tcp >> $install_log_path 2>&1

  # tls mail server
  echo "port 587 for tls mail server" >> $install_log_path
  sudo ufw allow 587/tcp >> $install_log_path 2>&1

  # http port
  echo "port 80 http for web server" >> $install_log_path
  sudo ufw allow 80/tcp >> $install_log_path 2>&1fi

  # https port
  echo "port 443 https for web server" >> $install_log_path
  sudo ufw allow 443/tcp >> $install_log_path 2>&1

  # default IMAP
  echo "port 143 imap for mail server" >> $install_log_path
  sudo ufw allow 143/tcp >> $install_log_path 2>&1

  # secure IMAP
  echo "port 993 secure imap for mail server" >> $install_log_path
  sudo ufw allow 993/tcp >> $install_log_path 2>&1

  # ssh
  echo "port 22 ssh" >> $install_log_path
  sudo ufw allow 22/tcp >> $install_log_path 2>&1

  # enable firewall
  echo y | sudo ufw enable >> $install_log_path 2>&1

  # store current status as log
  sudo ufw status verbose >> $install_log_path 2>&1
fi
