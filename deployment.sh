#!/bin/sh

# create a user and setup firewall
./scripts/secure_user.sh

# install haraka, nodejs and their prerequisite
./scripts/setup.sh

app_path=~/app/bizgaze-mail


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


