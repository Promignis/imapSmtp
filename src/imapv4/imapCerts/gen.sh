#!/bin/sh

echo "Generating certificates ..."

#create CA
openssl genrsa -out imapv4.server.ca.key 2048

openssl req -new -x509 -key imapv4.server.ca.key -out imapv4.server.ca.crt

# openssl x509 -in imapv4.server.ca.crt -noout -modulus | openssl sha1
# openssl rsa -in imapv4.server.ca.key -noout -modulus | openssl sha1

# create server certificate and sign 
openssl genrsa -out imapv4.server.key 4096

openssl req -new -key imapv4.server.key -out imapv4.server.csr -config ssl.conf -reqexts SAN

#openssl req -in imapv4.server.csr -noout -text

openssl x509 -req -in imapv4.server.csr -CA imapv4.server.ca.crt -CAkey imapv4.server.ca.key -set_serial 01  -out imapv4.server.crt -extfile ssl.conf -extensions SAN

# openssl x509 -in imapv4.server.crt -noout -modulus | openssl sha1
# openssl rsa -in imapv4.server.key -noout -modulus | openssl sha1

#update ca-certs
cp imapv4.server.ca.crt /usr/local/share/ca-certificates/imapv4.server.ca.crt
update-ca-certificates