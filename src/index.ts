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
import ethers from 'ethers';
import ServerCostCalculatorABI from './ABI/ServerCostCalculator';
import { apiCallWrapper } from '@decloudlabs/skynet/lib/utils/utils';
import { Collection, InsertManyResult, MongoClient } from 'mongodb';
import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
import { getSkyNode } from './clients/skynet';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors());


const validateParams = (params: any): {[index: string]: string} => {
  let validationObject: {[index: string]: string} = {};
  // let validationString = "";
  if(params.appName == null) {
    // validationString += "appName is required\n";
    validationObject['appName'] = "appName is required";
  }
  else {
    if(params.appName.length > 32) {
      validationObject['appName'] = "appName should not exceed more than 32 bytes";
    }
    if(!params.appName.match(/^[a-z]+[a-z0-9]*$/)) {
      validationObject['appName'] = "appName should only contain alphabets and numbers";
    }
  }

  if(params.httpPort == null) {
    if(params.httpPort < 1 || params.httpPort > 65535) {
      validationObject['httpPort'] = "httpPort should be between 1 and 65535";
    }
  }
  if(params.image == null) {
    validationObject['image'] = "image is required";
  }
  else {
    if(!params.image.match("^([a-z0-9]+([._-][a-z0-9]+)*/)*[a-z0-9]+([._-][a-z0-9]+)*(:[a-zA-Z0-9._-]+)?(@[A-Za-z0-9]+:[A-Fa-f0-9]+)?$")) {
      validationObject['image'] = "image is of invalid format";
    }
  }

  return validationObject;
}

const checkForEmptyParams = (params: any, parameters: {[index: string]: string}[]) => {
  let validationString = ''; 
  
  for(let i = 0; i < parameters.length; i++) {
    const key = Object.keys(parameters[i])[0];
    console.log("key: ", key, params[key])
    if(params[key] === null || params[key] === undefined || params[key] === '' || params[key] === 'null') {
      validationString += `${key}\n`;
    }
  }
  return validationString;
}

interface NFTCosts {
  nftID: string;
  costs: string;
}

let nftCostsCollection: Collection<NFTCosts>;

const setupDatabase = async () => {
  // const { MONGODB_URL, MONGODB_DBNAME } = process.env;
  const MONGODB_URL = process.env.MONGODB_URL || '';
  const MONGODB_DBNAME = process.env.MONGODB_DBNAME || '';

  const client = await MongoClient.connect(MONGODB_URL);
  console.log(`created database client: ${MONGODB_URL}`);

  const database = client.db(MONGODB_DBNAME);
  console.log(`connected to database: ${MONGODB_DBNAME}`);

  nftCostsCollection = database.collection<NFTCosts>("nftCosts");
}

const addBalance = async (nftID: string, price: string) => {
  const options = { ordered: true };
  const result = await apiCallWrapper<
      InsertManyResult<NFTCosts>,
      number
  >(
      nftCostsCollection.insertMany([{nftID, costs: price}], options),
      (res) => (res.acknowledged ? res.insertedCount : 0),
  );

  return result;
}

const addCost = async (skyNode: SkyMainNodeJS, nftID: string, price: string) => {
  const address = process.env.SERVER_COST_CALCULATOR_ADDRESS || '';
  const subnetID = process.env.SUBNET_ID || '';
  const abi = ServerCostCalculatorABI;
  const serverCostCalculator = new ethers.Contract(address, abi);



  const response = await skyNode.contractService.callContractWrite(serverCostCalculator.addNFTCosts(
    subnetID,
    nftID,
    price
  ));

  return response;
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

const parameters: {[index: string]: string}[] = [
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



const setup = async () => {
  await setupDatabase();

  const skyNode: SkyMainNodeJS = await getSkyNode();

  app.post('/natural-request', async (req, res) => {
    try {
      const { prompt, nftID } = req.body;
  
      let tryCount = 0;
      let validations:  string = "";
      let currentParameters = parameters;
      let finalParams: any;
      while(tryCount < 1) {
  
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

      const ModelPrice = {
        INPUT_PRICE: '150000000000',
        OUTPUT_PRICE:      '600000000000',
        CACHED_INPUT_PRICE: '75000000000'
      }

      const totalPrice = ethers.BigNumber.from(completion.usage?.prompt_tokens || 0).mul(ModelPrice.INPUT_PRICE)
      .add(ethers.BigNumber.from(completion.usage?.completion_tokens || 0).mul(ModelPrice.OUTPUT_PRICE))
      .add(ethers.BigNumber.from(completion.usage?.prompt_tokens || 0).mul(ModelPrice.CACHED_INPUT_PRICE));


      await addCost(skyNode, nftID, totalPrice.toString());

//       gpt-4o-mini
// $0.150 / 1M input tokens
// $0.075 / 1M input tokens
// $0.075 / 1M cached** input tokens
// $0.600 / 1M output tokens
// $0.300 / 1M output tokens
// gpt-4o-mini-2024-07-18
// $0.150 / 1M input tokens
// $0.075 / 1M input tokens
// $0.075 / 1M cached** input tokens
// $0.600 / 1M output tokens
// $0.300 / 1M output tokens
  

      console.log("completion: ", JSON.stringify(completion))
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
  
      if(validations.length > 0) {
        res.send("Please provide the missing parameters:\n "+ validations);
        return;
      }
  
  
      tryCount++;
    }
  
  
    const basicCPU = 128;
    const basicMemory = 2000;
    let resourceCount = [Math.max(finalParams.replicaCount / basicMemory, finalParams.resourceCpu / basicCPU)];
    let resourceType = [0];
    
    const response = await createApp(skyNode,finalParams.appName, finalParams.image, finalParams.httpPort, resourceType, resourceCount, [finalParams.replicaCount], finalParams.timeDuration, []);
  
      res.send("done: "+ JSON.stringify(response.data))
  
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'An error occurred while processing your request' });
    }
  });
  
  // Start the server
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
  
}

setup();
