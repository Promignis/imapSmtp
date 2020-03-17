# Bizgaze-mail

## Local Setup

Clone the repo:
```
git clone https://bitbucket.org/promignis117/bizgaze-mail
```

The SMTP server is in the `./mail-server` folder. We need to install all the dependencies for both http server and SMTP server
```
npm install
cd mail-server
npm install
cd ..
```

Install Haraka (the SMTP server)
``` 
npm install -g Haraka
```

## Start services

Start the SMPT service 
```
cd mail-server
sudo haraka -c .
```

Start the http service
```
source env.sh //Setup all the correct env variables
sudo -E npm run start //Start the service
```

## Configs
Configs can be found in `./config` folder. `default.json` has the base configs. 
Enviornment is setup using  `./env.sh` file.  change the `NODE_ENV` value to setup different envirmnments.
Enviornment specific configs are adeed in their specific json files which override specific properties of the default configs.
For exmaple id NODE_ENV is set to "test" then the server will look for test.json inside the config directory to pull the correct configs from. 
