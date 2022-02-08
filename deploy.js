const delay = function(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

const triggerDeployment = async function({caller_repo_id}){
  return await github.rest.actions.createWorkflowDispatch({
    owner: process.env.OPERATIONS_REPO_ORG,
    repo: process.env.OPERATIONS_REPO,
    workflow_id: process.env.OPERATIONS_REPO_WORKFLOW,
    ref: process.env.OPERATIONS_REPO_BRANCH,
    inputs: {
      caller_repo_id: caller_repo_id
    }
  })
}
const findWatchItems = async function({caller_repo_id}){
  let workflowToWatch = null
  let jobToWatch = null
  let stepToWatch = null


  // GET WORKFLOWS
  console.log("getting workflows...")
  const workflows = await getWorkflows({
    minutesBack: 2
  })

  console.log(`Workflows found: ${workflows.length}`)
  workflowToWatch = null
  let workflowItem = null
  for(let workflowIndex = 0; workflowIndex < workflows.length; workflowIndex++){
    workflowItem = workflows[workflowIndex]
    console.log(`workflow: ${workflowItem.name}`)

    // GET JOBS
    const jobs = await getJobsForWorkflow(workflowItem)
    console.log(`Jobs found for workflow (${workflowItem.name}): ${jobs.length}`)

    const jobParseResult = parseJobForStep({jobs,caller_repo_id})
    jobToWatch = jobParseResult.job
    stepToWatch = jobParseResult.step

    if(jobToWatch){
      console.log(`job found in workflow: ${workflowItem.name}`)
      workflowToWatch = workflowItem
      break
    }else{
      console.log(`no matching job found in workflow: ${workflowItem.name}`)
    }
  }
  return {workflowToWatch,jobToWatch,stepToWatch}
}

const getWorkflows = async function({minutesBack}){
  const listWorkflowsUrl = `/repos/${process.env.OPERATIONS_REPO_ORG}/${process.env.OPERATIONS_REPO}/actions/runs`
  const workflowsCreatedDate = (new Date( Date.now() - (1000 * 60) * minutesBack )).toISOString()
  const listWorkflowsParams = `branch=${process.env.OPERATIONS_REPO_BRANCH}&event=workflow_dispatch&created=>${workflowsCreatedDate}`
  const workflows = await github.request(`GET ${listWorkflowsUrl}?${listWorkflowsParams}`);
  return workflows.data.workflow_runs
}

const getJobsForWorkflow = async function(workflowItem){
  const jobsResult = await github.request(`GET ${workflowItem.jobs_url}`);
  return jobsResult.data.jobs
}

const parseJobForStep = function({jobs,caller_repo_id}){
  let res = {
    job: null,
    step: null
  }
  for(let jobIndex = 0; jobIndex < jobs.length; jobIndex++){
    let job = jobs[jobIndex]
    console.log(`Steps found for job (${job.name}): ${job.steps.length}`)
    console.log(`Looking for step: ${caller_repo_id}`)
    res.step = job.steps.find(step => step.name === `${caller_repo_id}`)
    if(res.step){
      console.log(`step found in job (${job.name}) that matches ${caller_repo_id}`)
      res.job = job
      break
    }else{
      console.log(`No step found in job (${job.name}) that matches ${caller_repo_id}`)
    }
  }
  return res
}


module.exports = async ({github, context}) => {
  // TODO: figure out how to do this in github actions 'if:'
  if(context.eventName == "pull_request"){
    console.log("Pull request. not triggering deployment")
  }else{
    console.log("Not a pull request. Triggering deployment")
    const caller_repo_id = `deploy_${process.env.GITHUB_REPOSITORY.replace('/','_')}_${Date.now()}`
  
    const deploymentRepoActionsUrl = `https://github.com/${process.env.OPERATIONS_REPO_ORG}/${process.env.OPERATIONS_REPO}/actions`
    const dispatchResult = await triggerDeployment({caller_repo_id});
    if(dispatchResult.status == 204){
      console.log("Deployment triggered successfully.")
      console.log(`To see the deployment, visit: ${deploymentRepoActionsUrl}`)
    }else{
      console.log("Deployment trigger failed.")
      console.log("dispatchResult")
      console.log(dispatchResult)
    }
  
    const pollStartTime = Date.now()
    let doneProcessing = false
    while(!doneProcessing){
      let pollCurrentTime = Date.now()
      let secondsSinceStart = (pollCurrentTime - pollStartTime) / 1000
      console.log(`Seconds elapsed: ${secondsSinceStart}`)
      if(secondsSinceStart >= process.env.POLL_TIMEOUT_SECONDS){
        console.log(`Polling timed out after ${process.env.POLL_TIMEOUT_SECONDS}s!`)
        console.log(`The deployment might still be running.  See:`)
        if(jobToWatch){
          console.log(jobToWatch.html_url)
        }else{
          console.log(deploymentRepoActionsUrl)
        }
        core.setFailed(`Polling timed out after ${process.env.POLL_TIMEOUT_SECONDS}s!`)
        doneProcessing = true
        continue
      }
      let {workflowToWatch, jobToWatch, stepToWatch} = await findWatchItems({caller_repo_id})
      if(stepToWatch){
  
        console.log("")
        console.log("=======================")
        console.log("=======================")
        console.log("=======================")
        console.log(`Deployment has started: ${jobToWatch.html_url}`)
        console.log(`workflow=${workflowToWatch.name},job=${jobToWatch.name},step=${stepToWatch.name}`)
        //console.log("step", stepToWatch)
        console.log("=======================")
        console.log("=======================")
        console.log("=======================")
        console.log("")
  
        let stepComplete = false
        while(!stepComplete){
          let pollCurrentTime = Date.now()
          let secondsSinceStart = (pollCurrentTime - pollStartTime) / 1000
          console.log("")
          console.log(`Seconds elapsed: ${secondsSinceStart}`)
          if(secondsSinceStart >= process.env.POLL_TIMEOUT_SECONDS){
            console.log(`Polling timed out after ${process.env.POLL_TIMEOUT_SECONDS}s!`)
            console.log(`The deployment might still be running.  See:`)
            console.log(jobToWatch.html_url)
            core.setFailed(`Polling timed out after ${process.env.POLL_TIMEOUT_SECONDS}s!`);
            doneProcessing = true
            stepComplete = true
            continue
          }
          if(stepToWatch.status === "in_progress"){
            console.log(`Deployment still in_progress. Trying again in ${process.env.POLL_INTERVAL_SECONDS}s`)
            await delay(process.env.POLL_INTERVAL_SECONDS*1000)
  
            // GET JOBS
            const jobs = await getJobsForWorkflow(workflowToWatch)
            const jobParseResult = parseJobForStep({jobs,caller_repo_id})
            jobToWatch = jobParseResult.job
            stepToWatch = jobParseResult.step
          }else{
            console.log("")
            console.log("=======================")
            console.log("=======================")
            console.log("=======================")
            console.log(`Deployment complete: ${jobToWatch.html_url}`)
            console.log("=======================")
            console.log("=======================")
            console.log("=======================")
            console.log("")
            stepComplete = true
            doneProcessing = true
            if(stepToWatch.conclusion === "failure"){
              console.log("Deployment failed")
              console.log("Step")
              console.log(stepToWatch)
              core.setFailed(`Deployment failed!`);
            }else if(stepToWatch.conclusion === "cancelled"){
              console.log("Deployment cancelled")
              console.log("Step")
              console.log(stepToWatch)
              core.setFailed(`Deployment cancelled!`);
            }else{
              console.log("Deployment was successful!")
            }
          }
        }
      }else{
        console.log("No steps to watch found. Maybe the deploy job is still starting up.")
        console.log(`Trying again in ${process.env.POLL_INTERVAL_SECONDS}s`)
        console.log("")
        await delay(process.env.POLL_INTERVAL_SECONDS*1000)
      }
    }
  }
}  
