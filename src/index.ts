import dotenv from 'dotenv';
dotenv.config();

import express from 'express';

import cors from 'cors';
import { checkBalance } from './middleware/checkBalance';
import { protect } from './middleware/auth';
import bodyParser from 'body-parser';
import { createApp } from './createApp';
import OpenAI from 'openai';
import fs from 'fs';
import { APICallReturn } from '@decloudlabs/skynet/lib/types/types';
import { ChatCompletionMessageParam } from 'openai/resources/chat';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());


const validateParams = (params: any): { [index: string]: string } => {
  let validationObject: { [index: string]: string } = {};
  // let validationString = "";
  if (params.appName == null) {
    // validationString += "appName is required\n";
    validationObject['appName'] = "appName is required";
  }
  else {
    if (params.appName.length > 32) {
      validationObject['appName'] = "appName should not exceed more than 32 bytes";
    }
    if (!params.appName.match(/^[a-z]+[a-z0-9]*$/)) {
      validationObject['appName'] = "appName should only contain alphabets and numbers";
    }
  }

  if (params.httpPort == null) {
    if (params.httpPort < 1 || params.httpPort > 65535) {
      validationObject['httpPort'] = "httpPort should be between 1 and 65535";
    }
  }
  if (params.image == null) {
    validationObject['image'] = "image is required";
  }
  else {
    if (!params.image.match("^([a-z0-9]+([._-][a-z0-9]+)*/)*[a-z0-9]+([._-][a-z0-9]+)*(:[a-zA-Z0-9._-]+)?(@[A-Za-z0-9]+:[A-Fa-f0-9]+)?$")) {
      validationObject['image'] = "image is of invalid format";
    }
  }

  return validationObject;
}

const checkForEmptyParams = (params: any, parameters: { [index: string]: string }[]) => {
  let validationString = '';

  for (let i = 0; i < parameters.length; i++) {
    const key = Object.keys(parameters[i])[0];
    console.log("key: ", key, params[key])
    if (params[key] === null || params[key] === undefined || params[key] === '' || params[key] === 'null') {
      validationString += `${key}\n`;
    }
  }
  return validationString;
}
//  protect, checkBalance,

// app.post('/request', async (req, res) => {
//   try {
//     const { appName, dockerImageName, dockerTag, containerPort, resourceType, resourceCount, multiplier, balance, environmentVariables } = req.body;
//     const repsonse = await createApp(appName, dockerImageName, dockerTag, containerPort, resourceType, resourceCount, multiplier, balance, environmentVariables);
//     res.send(repsonse);
//   } catch (error) {
//     console.error('Error:', error);
//     res.status(500).json({ error: 'An error occurred while processing your request' });
//   }
// });

// export interface AppComputePayload {
//   appName: string;
//   namespace: string;
//   nftID: string;
//   containers: {
//       name: string;
//       image: string;
//       tcpPorts: Port[];
//       httpPorts: Port[];
//       args?: string[];
//       commands?: string[];
//       envVariables?: CreateAppEnvVariables[];
//       volumeMounts?: CreateAppVolumeMounts[];
//       resourceLimits: ResourceUnit;
//       resourceRequests: ResourceUnit;
//   }[];
//   replicaCount: number;
//   whitelistedIps: string[];
//   persistence: {
//       name: string;
//       accessMode: "ReadWriteOnce";
//       storageType: "standard" | "ssd-sc";
//       storageSize?: string;
//   }[];
//   status: string;
//   privateImage?: {
//       registry: string;
//       username: string;
//       password: string;
//   };
//   attribVarList?: AttribVariableParam[];
// }

const parameters: { [index: string]: string }[] = [
  // {
  //   'appName': "name for the app, required if not provided generate an app name, if validation fails then generate another name"
  // },
  {
    'image': "image to use, required if not provided pass null"
  },
  {
    'httpPort': "port to use, required if not provided default to null"
  },
  {
    'timeDuration': "duration in seconds for which the app should run, required if not provided default to 60"
  },
  {
    "resourceCpu": "cpu in core only integer values allowed, smallest value 128, required if not provided default to 128, if invalid then set it to null "
  },
  {
    "resourceMemory": "memory in GB, only integer values allowed, smallest value 2000, required if not provided default to 2000, if invalid then set it to null"
  },
  {
    "replicaCount": "number of replicas, only integer values allowed, required if not provided default to 1, if invalid then set it to null"
  }
]

// protect, checkBalance, 
app.post('/natural-request', protect, checkBalance, async (req, res) => {
  try {
    const { prompt } = req.body;

    const systemPromptBuffer = fs.readFileSync("./create_app_prompt.txt");
    const systemPrompt = systemPromptBuffer.toString();

    let tryCount = 0;
    let validations: string = "";
    let currentParameters = parameters;
    let finalParams: any;
    while (tryCount < 1) {

      // appName : name for the app, required if not provided generate an app name,
      // image : image to use, required if not provided pass null,
      // httpPort: port to use, required if not provided default to null,

      console.log("currentParameters: ", currentParameters)
      let messages = [
        {
          role: "system",
          content: `
          You are a helpful assistant that extracts parameters from the user input for deploying applications. Dont assume any parameters always ask for them. 
          Return a json object.
          Ask questions only about the parameters.
          these are the parameter definitions:
            action : keep it as create,
            ${currentParameters.map((param: any) => `${Object.keys(param)[0]}: ${param[Object.keys(param)[0]]}`).join(',\n')}            
`
        },

        {
          role: "user",
          content: prompt + `${validations.length > 0 ? `\n\Validations are failing: ${validations}` : ''}`
        }
      ];
      //            question: If any parameters are not clear, then ask for them. If they are clear, then this field should be an empty string"    

      console.log("messages: ", messages)
      const completion = await openai.chat.completions.create({
        messages: messages as ChatCompletionMessageParam[],
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0].message.content || '';
      console.log("content: ", content)


      const extractedParams = JSON.parse(content);

      extractedParams.appName = "app1"

      validations = checkForEmptyParams(extractedParams, parameters);
      // if(extractedParams.question) {
      //   let questions = extractedParams.question;
      //   delete extractedParams.question;
      //   const response = `These are the parameters I have: ${JSON.stringify(extractedParams)}. The following parameters are missing: ${questions}.`;
      //   res.send(response);
      //   return;
      // }



      finalParams = extractedParams;
      finalParams.validations = validations;

      if (validations.length > 0) {
        res.send({
          "status": "error",
          "message": "Please provide the missing parameters:\n " + validations
        });
        return;
      }


      tryCount++;
    }


    const basicCPU = 128;
    const basicMemory = 2000;
    let resourceCount = [Math.max(finalParams.replicaCount / basicMemory, finalParams.resourceCpu / basicCPU)];
    let resourceType = [0];

    const response = await createApp(finalParams.appName, finalParams.image, finalParams.httpPort, resourceType, resourceCount, [finalParams.replicaCount], finalParams.timeDuration, []);

    res.send({
      "status": "success",
      "message": JSON.stringify(response.data)
    })

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing your request' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
