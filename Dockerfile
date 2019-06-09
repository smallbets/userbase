FROM node:12.4.0

RUN apt-get -y update
RUN apt-get -y install awscli

WORKDIR /usr/src/app

COPY . .

RUN npm ci
RUN npm run build

EXPOSE 8080

CMD [ "npm", "run", "start:prod" ]
