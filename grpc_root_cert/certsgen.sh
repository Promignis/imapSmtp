#!/bin/sh

echo "Generating certificates ..."

#create root CA cert
openssl genrsa -out bizgaze.root.key 2048

openssl req -new -x509 -key bizgaze.root.key -out bizgaze.root.crt -subj  "/CN=ca" -days 365

# create server
openssl genrsa -out server.key 4096

openssl req -new -key server.key -out server.csr -subj  "/CN=localhost"

openssl x509 -req -in server.csr -CA bizgaze.root.crt -CAkey bizgaze.root.key -set_serial 01  -out server.crt -days 365

# client

openssl genrsa -out client.key 4096

openssl req -new -key client.key -out client.csr -subj  "/CN=localhost"

openssl x509 -req -in client.csr -CA bizgaze.root.crt -CAkey bizgaze.root.key -set_serial 01  -out client.crt -days 365
