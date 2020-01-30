const express = require('express');
const app = express();
const spawn = require('child_process').spawnSync;
const timediff = require('timediff');

let TIME_LIMIT = process.env.TIME_LIMIT || 99999999; // Set the value to a large number (e.g. 190 years) if the time limit isn't properly configured.
let REGION = process.env.REGION || 'us-central1';

let port = process.env.PORT || '8080';

app.get('/', function(req, res) {
    let results = stopJobs(parseJobs(TIME_LIMIT, REGION), REGION);
    res.send(results);
});

/**
 * Get a list of all active jobs running within the configured region, and return a list of any jobs that exceed the configured maximum duration.
 * @param {Integer} maximumDuration - Maximum duration before a job is reported back.
 * @param {String} region - Region where the dataflow jobs reside.
 * @returns {Array} - List of jobs that violated the maximum duration.
 */
function parseJobs(maximumDuration, region) {
    let command = ['dataflow', 'jobs', 'list', '--status=active', '--region=' + region, '--format=json'];
    const checkJobs = JSON.parse(spawn('gcloud', command).stdout);

    let badJobs = [];

    console.log(`Checking for jobs that exceed configuration maximum duration (${maximumDuration}) with ${region}...\n`);
    for (let i = 0; i < checkJobs.length; i++) {
        // (job).creationTime will be in the format: 2020-01-29 20:48:36
        let jobDate = checkJobs[i].creationTime.split(' ')[0];
        let jobTime = checkJobs[i].creationTime.split(' ')[1];

        let creation = new Date(
            Date.UTC(
                jobDate.split('-')[0],
                jobDate.split('-')[1] - 1,
                jobDate.split('-')[2],
                jobTime.split(':')[0],
                jobTime.split(':')[1],
                jobTime.split(':')[2]
            )
        );

        let duration = timediff(creation, new Date(), 'm').minutes;
        if (duration > maximumDuration) {
            console.log(
                `Found job violating maximum duration:\n` +
                    `\t ID: ${checkJobs[i].id}\n` +
                    `\t Creation Time: ${checkJobs[i].creationTime}\n` +
                    `\t Duration: ${duration}\n`
            );
            badJobs.push(checkJobs[i].id);
        }
    }
    return badJobs;
}

/**
 * Perform a cancel operation on any Dataflow jobs passed.
 * @param {Array} badJobs - Array of jobs to cancel.
 * @param {String} region - Region where the Dataflow jobs reside.
 * @returns {Object} - Returns an object with two arrays (success, failed) that house the list of jobs in their respective status.
 */
function stopJobs(badJobs, region) {
    let jobResults = {
        success: [],
        failed: []
    };
    for (let job in badJobs) {
        console.log(`\nAttempting to stop job: ${badJobs[job]}`);
        let command = ['dataflow', 'jobs', 'cancel', badJobs[job], '--region=' + region];
        const cancelJob = spawn('gcloud', command);

        if (cancelJob.status === 0 && cancelJob.output.toString('utf8').includes('Cancelled job')) {
            console.log(`Stopped job (${badJobs[job]}) successfully!`);
            jobResults.success.push(badJobs[job]);
        } else {
            console.log(`Failed to stop job: ${badJobs[job]}`);
            jobResults.failed.push(badJobs[job]);
        }
    }
    return jobResults;
}

app.listen(port, function() {
    console.log(`App listening on port ${port}!`);
});
