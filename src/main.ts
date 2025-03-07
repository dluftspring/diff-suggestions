import * as github from '@actions/github';
import * as core from '@actions/core';
import {exec} from '@actions/exec';

import {createReviewCommentsFromPatch} from './createReviewCommentsFromPatch';

const {GITHUB_EVENT_PATH} = process.env;
const {owner, repo} = github.context.repo;
const token = core.getInput('github-token') || core.getInput('githubToken');
const octokit = token && github.getOctokit(token);
// @ts-ignore
const eventPayload = require(GITHUB_EVENT_PATH);
// prefer git context number to input value
const pullRequestNumber =
  github.context.payload.pull_request?.number ||
  +core.getInput('pull_request_number');

const commitSha = eventPayload?.head?.sha || eventPayload?.head_commit?.id;

core.debug(String(pullRequestNumber));
core.debug(commitSha);

async function run(): Promise<void> {
  if (!octokit) {
    core.debug('No octokit client');
    return;
  }

  if (!pullRequestNumber) {
    core.debug('Requires a pull request');
    // don't supply a zero exit code if no PR number is passed
    core.setFailed('Pull request must be supplied for action to work');
  }
  if (!commitSha) {
    core.debug('To post review comments we need the most recent commit sha');
    core.setFailed('Unable to retrieve commit sha from github context');
  }
  const commentBody =
    core.getInput('message') ||
    'Something magical has suggested this change for you';

  let gitDiff = '';
  let gitDiffError = '';

  try {
    await exec('git', ['diff', '-U0', '--color=never'], {
      listeners: {
        stdout: (data: Buffer) => {
          gitDiff += data.toString();
        },
        stderr: (data: Buffer) => {
          gitDiffError += data.toString();
        },
      },
    });
  } catch (error) {
    core.setFailed(error.message);
  }

  if (gitDiffError) {
    core.setFailed(gitDiffError);
  }

  try {
    await createReviewCommentsFromPatch({
      octokit,
      owner,
      repo,
      commentBody,
      gitDiff,
      // @ts-ignore
      pullRequest: pullRequestNumber,
      commitId: commitSha,
    });
  } catch (err) {
    core.setFailed(err);
  }

  // If we have a git diff, then it means that some linter/formatter has changed some files, so
  // we should fail the build
  if (!!gitDiff) {
    core.setFailed(
      new Error(
        'The linter has applied fixes, please update your PR with the code review suggestions'
      )
    );
  }
}

run();
