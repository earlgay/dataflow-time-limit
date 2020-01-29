var express = require('express');
var router = express.Router();
const request = require("request");

(async () => {
  let project = await getProject();
  let networkEgressError = (project === undefined) ? await checkNetworkEgressBlock() : false;

  /* GET home page. */
  router.get('/', async function (req, res, next) {
    res.render('index', {
      title: 'Congratulations | Cloud Run',
      service: (process.env.K_SERVICE == undefined) ? "???" : process.env.K_SERVICE,
      revision: (process.env.K_REVISION == undefined) ? "???" : process.env.K_REVISION,
      project: (project === undefined) ? "???" : project,
      networkEgressError: networkEgressError
    });
  });
})();

function getProject() {
  return new Promise((resolve, reject) => {
    const options = {
      url: 'http://metadata.google.internal/computeMetadata/v1/project/project-id',
      headers: {
        'Metadata-Flavor': 'Google'
      }
    };
    request.get(options, (error, response, body) => {
      if (!error && response.statusCode == 200) {
        return resolve(body);
      } else {
        return resolve();
      }
    });
  });
}

function checkNetworkEgressBlock() {
  return new Promise((resolve, reject) => {
    let url = 'http://www.google.com'
    request.get(url, (error, response, body) => {
      if (!error && response.statusCode == 200) {
        console.log("Verified that network egress is working as expected.");
        return resolve(false);
      } else {
        console.log("Network egress appears to be blocked. Unable to access " + url + ".");
        return resolve(true);
      }
    });
  });
}

module.exports = router;
