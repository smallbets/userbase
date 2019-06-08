FROM node:12.4.0

RUN apt-get update
RUN apt-get -y install awscli

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

EXPOSE 8080

CMD [ "npm", "run", "start:prod" ]
