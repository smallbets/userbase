#!/bin/bash
mkdir -p /home/ec2-user/encd/keys
cp /etc/letsencrypt/live/staging.encrypted.dev/* /home/ec2-user/encd/keys/
chown ec2-user:ec2-user /home/ec2-user/encd/keys/*
