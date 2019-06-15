#!/bin/bash

# Generate a personal access token with repo and admin:repo_hook permissions from https://github.com/settings/tokens
ACCESS_TOKEN=$(cat ~/.github/access-token)

# Deploy the CloudFormation template
aws cloudformation deploy \
    --region us-west-2 \
    --profile encrypted \
    --stack-name encd \
    --template-file ./deploy/infra.yml \
    --no-fail-on-empty-changeset \
    --parameter-overrides \
      GitHubOwner=dvassallo \
      GitHubRepo=encrypted.dev \
      GitHubBranch=master \
      GitHubPersonalAccessToken=$ACCESS_TOKEN \
      EC2KeyPair=encrypted-staging \
      EC2InstanceType=t3.micro \
      EC2AMI=ami-0cb72367e98845d43 \
      Domain=encrypted.dev \
    --capabilities CAPABILITY_NAMED_IAM
