#!/bin/bash
mkdir -p /home/ec2-user/encd/keys
cp /home/ec2-user/keys/* /home/ec2-user/encd/keys/
chown -R ec2-user:ec2-user /home/ec2-user/encd/keys
