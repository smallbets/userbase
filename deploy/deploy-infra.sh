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
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
      GitHubOwner=encrypted-dev \
      GitHubRepo=proof-of-concept \
      GitHubBranch=master \
      GitHubPersonalAccessToken=$ACCESS_TOKEN \
      EC2InstanceType=t3.micro \
      Domain=encrypted.dev \
      Certificate=arn:aws:acm:us-west-2:446495294306:certificate/98cc709e-332e-4adf-ad3a-9e508c087e74
