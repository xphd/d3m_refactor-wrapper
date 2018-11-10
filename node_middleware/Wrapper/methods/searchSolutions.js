// searchSolutionsResponse
// getSearchSolutionsResultsResponse
const fs = require("fs");
const appRoot = require("app-root-path");
const evaluationConfig = require(appRoot + "/tufts_gt_wisc_configuration.json");
// import properties
const properties = require("../properties");
const proto = properties.proto;
const userAgentTA3 = properties.userAgentTA3;
const grpcVersion = properties.grpcVersion;
const allowed_val_types = properties.allowed_val_types;
// import functions
const getMappedType = require("../functions/getMappedType");
const getProblemSchema = require("../functions/getProblemSchema");
const handleImageUrl = require("../functions/handleImageUrl");
// import mappings
const metric_mappings = require("../mappings/metric_mappings");
const task_subtype_mappings = require("../mappings/task_subtype_mappings");
const task_type_mappings = require("../mappings/task_type_mappings");

searchSolutions = function(sessionVar) {
  // remove old solutions
  sessionVar.solutions = new Map();
  const problemSchema = getProblemSchema();
  // console.log(problemSchema.about.problemID);
  return new Promise(function(fulfill, reject) {
    let request = new proto.SearchSolutionsRequest();
    request.setUserAgent(userAgentTA3);
    request.setVersion(grpcVersion);
    if (sessionVar.ta2Ident.user_agent.startsWith("nyu_ta2")) {
      console.log(
        "nyu ta2 detected; setting time bound for searching solutions to 10"
      );
      request.setTimeBound(10);
    } else {
      console.log(
        "non-nyu ta2 detected; setting time bound for searching solutions to 2"
      );
      request.setTimeBound(2);
    }
    request.setAllowedValueTypes(allowed_val_types);
    let problem_desc = new proto.ProblemDescription();
    let problem = new proto.Problem();
    problem.setId(problemSchema.about.problemID);
    if (!problemSchema.about.problemVersion) {
      console.log("problem version not set, setting default value 1.0");
      problem.setVersion("1.0");
    } else {
      problem.setVersion(problemSchema.about.problemVersion);
    }
    problem.setName(problemSchema.about.problemName);
    problem.setDescription(problemSchema.about.problemDescription + "");
    problem.setTaskType(
      getMappedType(task_type_mappings, problemSchema.about.taskType)
    );
    if (task_subtype_mappings[problemSchema.about.taskSubType]) {
      problem.setTaskSubtype(
        getMappedType(task_subtype_mappings, problemSchema.about.taskSubType)
      );
    } else {
      problem.setTaskSubtype(task_subtype_mappings["none"]);
    }
    let metrics = [];
    for (let i = 0; i < problemSchema.inputs.performanceMetrics.length; i++) {
      metrics.push();
      metrics[i] = new proto.ProblemPerformanceMetric();
      metrics[i].setMetric(
        getMappedType(
          metric_mappings,
          problemSchema.inputs.performanceMetrics[i].metric
        )
      );
    }
    problem.setPerformanceMetrics(metrics);
    problem_desc.setProblem(problem);
    let inputs = [];
    // console.log("problem schema:", handleImageUrl(evaluationConfig.problem_schema));
    for (let i = 0; i < problemSchema.inputs.data.length; i++) {
      let targets = [];
      let next_input = new proto.ProblemInput();
      let thisData = problemSchema.inputs.data[i];
      next_input.setDatasetId(thisData.datasetID);
      for (let j = 0; j < thisData.targets.length; j++) {
        let next_target = new proto.ProblemTarget();
        let thisTarget = thisData.targets[j];
        next_target.setTargetIndex(thisTarget.targetIndex);
        next_target.setResourceId(thisTarget.resID);
        next_target.setColumnIndex(thisTarget.colIndex);
        next_target.setColumnName(thisTarget.colName);
        // next_target.setClustersNumber(clusters_num);
        targets.push(next_target);
      }
      next_input.setTargets(targets);
      inputs.push(next_input);
    }
    problem_desc.setInputs(inputs);
    let dataset_input = new proto.Value();
    dataset_input.setDatasetUri(
      "file://" + handleImageUrl(evaluationConfig.dataset_schema)
    );
    request.setInputs(dataset_input);
    request.setProblem(problem_desc);
    console.log("searchSolutions begin");

    properties.client.searchSolutions(
      request,
      (err, searchSolutionsResponse) => {
        if (err) {
          console.log("Error!searchSolutions");
          reject(err);
        } else {
          // Added by Alex, for the purpose of Pipeline Visulization
          let responseStr = JSON.stringify(searchSolutionsResponse);
          fs.writeFileSync(
            "responses/searchSolutionsResponse.json",
            responseStr
          );

          sessionVar.searchID = searchSolutionsResponse.search_id;
          // setTimeout(() => getSearchSolutionResults(sessionVar, fulfill, reject), 180000);
          getSearchSolutionResults(sessionVar, fulfill, reject);
        }
      }
    );
    console.log("searchSolutions end");
  });
};

function getSearchSolutionResults(sessionVar, fulfill, reject) {
  // this is needed so that fulfill or reject can be calle later
  let _fulfill = fulfill;
  let _reject = reject;
  let getSearchSolutionsResultsRequest = new proto.GetSearchSolutionsResultsRequest();
  getSearchSolutionsResultsRequest.setSearchId(sessionVar.searchID);

  // Added by Alex, for the purpose of Pipeline Visulization
  let pathPrefix = "responses/getSearchSolutionsResultsResponses/";
  if (!fs.existsSync(pathPrefix)) {
    fs.mkdirSync(pathPrefix);
  }

  return new Promise(function(fulfill, reject) {
    console.log("getSearchSolutionsResults begin");
    // if (sessionVar.ta2Ident.user_agent.startsWith("nyu_ta2")) {
    //   let timeBoundInMinutes = 1;
    //   console.log("NYU detected; making sure they stop sending solutions after a " + timeBoundInMinutes + "min time bound");
    /*
      setTimeout(function() {
        console.log("That's enough nyu! Calling endSearchSolutions");
        obj.endSearchSolutions(sessionVar);
      }, timeBoundInMinutes * 60 * 1000 * 5);
      */
    // setTimeout needs time in ms
    // }
    let call = properties.client.getSearchSolutionsResults(
      getSearchSolutionsResultsRequest
    );

    call.on("data", function(getSearchSolutionsResultsResponse) {
      let solutionID = getSearchSolutionsResultsResponse.solution_id;
      // if ( (!sessionVar.ta2Ident.user_agent.startsWith("nyu_ta2")) ||
      // ignore of internal_score is NaN or 0 for nyu
      //      (getSearchSolutionsResultsResponse.internal_score)) {
      if (solutionID) {
        let solution = { solutionID: solutionID };
        sessionVar.solutions.set(solution.solutionID, solution);

        // Added by Alex, for the purpose of Pipeline Visulization
        let pathPrefix = "responses/getSearchSolutionsResultsResponses/";
        let pathMid = solutionID;
        let pathAffix = ".json";
        let path = pathPrefix + pathMid + pathAffix;
        let responseStr = JSON.stringify(getSearchSolutionsResultsResponse);
        fs.writeFileSync(path, responseStr);
        let id = solutionID;
        let index = Array.from(sessionVar.solutions.values()).length;
        console.log("new solution:", index, id);
      } else {
        console.log("ignoring empty solution id");
      }
    });
    call.on("error", function(err) {
      console.log("Error!getSearchSolutionResults");
      _reject(err);
    });
    call.on("end", function(err) {
      console.log("End of result: getSearchSolutionResults");
      if (err) {
        console.log("err is ", err);
      }

      // not tested begin
      // export the sessionVar to json file for potential examinaztion
      fs.writeFileSync("responses/sessionVar.json", JSON.stringify(sessionVar));
      // same for sessionVar.solutions
      let tempSolutions = [];
      for (let value of sessionVar.solutions.values()) {
        tempSolutions.push(value);
      }
      const tempSolutionsStr = JSON.stringify(tempSolutions);
      fs.writeFileSync("responses/solutions.json", tempSolutionsStr);
      // not tested end

      _fulfill(sessionVar);
    });
  });
}

module.exports = searchSolutions;