#!/usr/bin/env node

/**
 * Vercel Storage Cleaner
 * Safely purges old, inactive historical deployments across all projects
 * to prevent exceeding Vercel Deployment Storage limits (Hobby & Pro).
 * 
 * Author: Shekhar Mishra (Virus1260)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Parse CLI Arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const tokenArgIndex = args.findIndex((arg) => arg.startsWith('--token=') || arg === '--token');
let customToken = null;
if (tokenArgIndex !== -1) {
  if (args[tokenArgIndex].startsWith('--token=')) {
    customToken = args[tokenArgIndex].split('=')[1];
  } else if (args[tokenArgIndex + 1]) {
    customToken = args[tokenArgIndex + 1];
  }
}

// Auto-detect Vercel Auth Token
function getAuthToken() {
  if (customToken) return customToken;
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;

  // Check Windows Roaming com.vercel.cli
  const winPath = path.join(
    process.env.APPDATA || '',
    'com.vercel.cli',
    'Data',
    'auth.json'
  );
  if (fs.existsSync(winPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(winPath, 'utf8'));
      if (data.token) return data.token;
    } catch {
      // ignore
    }
  }

  // Check ~/.vercel/auth.json
  const homePath = path.join(os.homedir(), '.vercel', 'auth.json');
  if (fs.existsSync(homePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(homePath, 'utf8'));
      if (data.token) return data.token;
    } catch {
      // ignore
    }
  }

  return null;
}

const token = getAuthToken();

if (!token) {
  console.error('\x1b[31m[ERROR] No Vercel authentication token found!\x1b[0m');
  console.error('\nPlease authenticate using one of the following methods:');
  console.error('  1. Run `npx vercel login` in your terminal');
  console.error('  2. Set the environment variable: export VERCEL_TOKEN="your_token" (or $env:VERCEL_TOKEN="...")');
  console.error('  3. Pass the token directly: node clean.mjs --token=your_token\n');
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${token}`,
  'User-Agent': 'Vercel-Storage-Cleaner/1.0.0',
};

async function fetchWithRetry(url, options = {}, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '15', 10);
        console.warn(`\x1b[33m  [RATE LIMIT] Hit Vercel 429. Waiting ${retryAfter}s before retry (Attempt ${attempt}/${retries})...\x1b[0m`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!res.ok && res.status !== 404) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`\x1b[33m  [RETRY] Request failed: ${err.message}. Retrying in 5s...\x1b[0m`);
      await sleep(5000);
    }
  }
}

async function verifyUser() {
  const res = await fetchWithRetry('https://api.vercel.com/v2/user', { headers: HEADERS });
  const data = await res.json();
  return data.user;
}

async function getAllProjects() {
  let allProjects = [];
  let nextUrl = 'https://api.vercel.com/v9/projects?limit=100';

  while (nextUrl) {
    const res = await fetchWithRetry(nextUrl, { headers: HEADERS });
    const data = await res.json();
    if (data.projects) {
      allProjects = allProjects.concat(data.projects);
    }
    if (data.pagination && data.pagination.next) {
      nextUrl = `https://api.vercel.com/v9/projects?limit=100&until=${data.pagination.next}`;
    } else {
      nextUrl = null;
    }
  }

  return allProjects;
}

async function getProjectDeployments(projectId) {
  let allDeployments = [];
  let nextUrl = `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=100`;

  while (nextUrl) {
    const res = await fetchWithRetry(nextUrl, { headers: HEADERS });
    const data = await res.json();
    if (data.deployments) {
      allDeployments = allDeployments.concat(data.deployments);
    }
    if (data.pagination && data.pagination.next) {
      nextUrl = `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=100&until=${data.pagination.next}`;
    } else {
      nextUrl = null;
    }
  }

  return allDeployments;
}

async function deleteDeployment(deploymentId) {
  const res = await fetchWithRetry(`https://api.vercel.com/v13/deployments/${deploymentId}`, {
    method: 'DELETE',
    headers: HEADERS,
  });
  return res.ok;
}

async function main() {
  console.log('\n========================================================');
  console.log('       🚀 VERCEL STORAGE CLEANER & PURGER 🚀');
  console.log('========================================================');

  if (isDryRun) {
    console.log('\x1b[36m[MODE] DRY RUN ENABLED - No deployments will be deleted.\x1b[0m\n');
  }

  try {
    const user = await verifyUser();
    console.log(`\x1b[32m✔ Authenticated as: ${user.username} (${user.email})\x1b[0m\n`);
  } catch (err) {
    console.error(`\x1b[31m[ERROR] Authentication failed: ${err.message}\x1b[0m`);
    process.exit(1);
  }

  console.log('Fetching all projects in your account...');
  const projects = await getAllProjects();
  console.log(`Found \x1b[32m${projects.length}\x1b[0m projects.\n`);

  let totalScanned = 0;
  let totalDeleted = 0;
  let totalErrors = 0;
  let totalRetained = 0;

  const projectSummaries = [];

  for (const project of projects) {
    const activeProdId = project.targets?.production?.id || null;
    const deployments = await getProjectDeployments(project.id);
    totalScanned += deployments.length;

    // Filter out active production deployment and already deleted deployments
    const deletable = deployments.filter((d) => d.uid !== activeProdId && d.state !== 'DELETED');
    const retained = deployments.length - deletable.length;
    totalRetained += retained;

    console.log(`📁 \x1b[1m${project.name}\x1b[0m`);
    console.log(`   Total deployments: ${deployments.length} | Protected (Active): ${retained} | Deletable: ${deletable.length}`);

    let projectDeleted = 0;

    for (const dep of deletable) {
      if (isDryRun) {
        console.log(`   [DRY-RUN] Would delete: ${dep.uid} (${dep.url})`);
        projectDeleted++;
      } else {
        try {
          await deleteDeployment(dep.uid);
          projectDeleted++;
          totalDeleted++;
          process.stdout.write(`\r   🧹 Purged: ${projectDeleted}/${deletable.length} deployments...`);
          await sleep(150); // Pace API requests
        } catch (err) {
          totalErrors++;
          console.error(`\n   \x1b[31m✖ Failed to delete ${dep.uid}: ${err.message}\x1b[0m`);
        }
      }
    }

    if (!isDryRun && deletable.length > 0) {
      console.log(`\r   ✔ Purged all ${projectDeleted} inactive deployments!          `);
    } else if (deletable.length === 0) {
      console.log(`   ✔ Already clean! Only active production deployment stored.`);
    }

    projectSummaries.push({
      name: project.name,
      total: deployments.length,
      deleted: projectDeleted,
      kept: retained,
    });
    console.log('');
  }

  console.log('========================================================');
  console.log('                 📊 CLEANUP SUMMARY');
  console.log('========================================================');
  console.log(` Total Deployments Scanned : ${totalScanned}`);
  console.log(` Protected Active Builds    : ${totalRetained}`);
  if (isDryRun) {
    console.log(` Deployments Eligible      : ${totalDeleted} (Dry Run)`);
  } else {
    console.log(` Deployments Purged        : \x1b[32m${totalDeleted}\x1b[0m`);
    console.log(` Errors Encountered        : ${totalErrors > 0 ? `\x1b[31m${totalErrors}\x1b[0m` : '0'}`);
  }
  console.log('========================================================');
  console.log('\x1b[32m✨ Finished! Your Vercel storage has been successfully reclaimed.\x1b[0m\n');
}

main().catch((err) => {
  console.error('\n\x1b[31m[FATAL ERROR]\x1b[0m', err);
  process.exit(1);
});
