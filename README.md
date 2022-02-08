# GitHub Action to deploy a BitOps Operations Repo

Deploys a [BitOps Operations Repo](https://bitovi.github.io/bitops/operations-repo-structure/).

## Usage
For usage, see `action.yml`


## Prerequisites
The operations repo must have a github to trigger with the following input on `workflow_dispatch`:
```
on:
  workflow_dispatch:
    inputs:
      caller_repo_id:
        description: 'Repo that called this one'
        required: true
```

Then, the name of the step to watch should be set to the `caller_repo_id` input like:
```
    - name: ${{ github.event.inputs.caller_repo_id }}
```



Full example
```
name: Deploy dev trigger

on:
  workflow_dispatch:
    inputs:
      caller_repo_id:
        description: 'Repo that called this one'
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - name: ${{ github.event.inputs.caller_repo_id }}
      env:
        ENVIRONMENT: dev
        AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
        AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY}}
        AWS_DEFAULT_REGION: us-west-2
      run: |
        echo "running  _scripts/deploy/deploy.sh"
        ./_scripts/deploy/deploy.sh
```


