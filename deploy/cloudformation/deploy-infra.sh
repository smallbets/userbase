#!/bin/bash

# Generate a personal access token with repo and admin:repo_hook permissions from https://github.com/settings/tokens
ACCESS_TOKEN=$(cat ~/.github/access-token)

# Deploy the CloudFormation template
aws cloudformation deploy \
    --region us-west-2 \
    --profile encrypted \
    --stack-name encd \
    --template-file ./deploy/cloudformation/infra.yml \
    --no-fail-on-empty-changeset \
    --parameter-overrides \
      GitHubOwner=dvassallo \
      GitHubRepo=encrypted.dev \
      GitHubBranch=master \
      GitHubPersonalAccessToken=$ACCESS_TOKEN \
    --capabilities CAPABILITY_NAMED_IAM
