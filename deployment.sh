#!/bin/sh

# infra related and top level running of scripts

SPAMASSASSIN=1
SPF=1
DKIM=1

# create a user and setup firewall
./scripts/secure_user.sh

# install haraka, nodejs and their prerequisite
./scripts/setup.sh

app_path=~/app/bizgaze-mail

export HARAKA_CONF="$app_path/mail-server/config"

# setup spamassassin
if [ $SPAMASSASSIN -eq 1 ]; then
  sudo apt-get install -y spamassassin
  sudo sed -i.bak -e 's/ENABLED=0/ENABLED=1/' /etc/default/spamassassin
  sudo sed -i.bak -e 's/CRON=0/CRON=1/' /etc/default/spamassassin
  sudo update-rc.d spamassassin enable
  service spamassassin start
  sudo sed -i.bak -e 's/#spamassassin/spamassassin/' $HARAKA_CONF/plugins
fi

# spf
if [ $SPF -eq 1 ]; then
  sudo sed -i.bak -e 's/#spf/spf/' $HARAKA_CONF/plugins
fi

# setup dkim
if [ $DKIM -eq 1 ]; then
  cd "${app_path}/mail-server/config/dkim/"
  chmod +x dkim_key_gen.sh
  ./dkim_key_gen.sh $DOMAIN

  key_len=$(($(cat ./$DOMAIN/public | wc -l)-1))
  selector=$(cat ./$DOMAIN/selector)
  dkim_public_key=$(sed -n "2,${key_len}p" ./$DOMAIN/public | tr -d ' ' | tr -d '\n')

  echo "Create TXT record for DKIM"

  echo "Hostname"
  echo "$selector._domainkey.$DOMAIN"

  echo "TXT record value"
  echo "v=DKIM1;p=$dkim_public_key"
fi
