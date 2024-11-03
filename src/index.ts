import dotenv from 'dotenv';
dotenv.config();

import express from 'express';

import cors from 'cors';
import { checkBalance } from './middleware/checkBalance';
import { protect } from './middleware/auth';
import bodyParser from 'body-parser';
import { createApp } from './createApp';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());

//  protect, checkBalance,

app.post('/request', async (req, res) => {
  try {
    const { appName, dockerImageName, dockerTag, containerPort, resourceType, resourceCount, multiplier, balance, environmentVariables } = req.body;
    const repsonse = await createApp(appName, dockerImageName, dockerTag, containerPort, resourceType, resourceCount, multiplier, balance, environmentVariables);
    res.send(repsonse);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing your request' });
  }
});
// protect, checkBalance, 
app.post('/natural-request', async (req, res) => {
  try {
    const { prompt } = req.body;

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Introduction:
                Extract the parameters from the following user input and the conversation history and output only a JSON object that is compatible with JSON.parse in Node.js. 
            Do not include any additional text, formatting, or symbols (such as backticks, Markdown, or other code annotations). 
            Each parameter should conform to the specified format. 
            If a  parameter does not meet validation requirements, 
            suggest an alternative conforming to the validation criteria.
            Convert units where specified.
            Do not assume the user parameters, ask for them if you need them.

            Parameter Extraction Instructions:

            1. projectID: Identify the project ID.
                - Validation: Check if it matches the regex pattern: ^[0-9]+$.

            2. appName: Identify the name of the app being deployed.  
                - Validation: Check if it matches the regex pattern: ^[a-z]+[a-z0-9]*$. 
                - Suggestion: If it fails validation, suggest a name using only lowercase letters and numbers, starting with a letter.

            3. image: Identify the Docker image to be used for deployment.  
                - Validation: Ensure it matches the regex pattern: ^([a-z0-9]+([._-][a-z0-9]+)*/)*[a-z0-9]+([._-][a-z0-9]+)*(:[a-zA-Z0-9._-]+)?(@[A-Za-z0-9]+:[A-Fa-f0-9]+)?$.
                - Suggestion: If it fails validation, suggest a compatible Docker image name following this syntax.

            4. httpPort: Extract the port number on which the container should run.  
                - Validation: Ensure this is an integer between 1 and 65535.

            5. timeDuration: Determine the duration for which the app should run, expressed in seconds.  
                - Conversion: Convert the user-provided time (days, hours, minutes, etc.) into seconds.
                - Example: If the user specifies "1 day," convert it to 86400 seconds.

            6. questions: If any user parameters are not clear, then ask for them. If they are clear, then this field should be an empty string


Final Output:  
Provide the output as a JSON object following this structure:
{
  "projectID": "<project_id>",
  "appName": "<app_name>",
  "image": "<docker_image>",
  "httpPort": <container_port>,
  "timeDuration": <duration_in_seconds>,
  "questions": "<questions>"
}`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "gpt-3.5-turbo-0125",
      response_format: { type: "json_object" }
    });

    const extractedParams = JSON.parse(completion.choices[0].message.content || '');
    console.log(extractedParams);

    const response = await createApp(
      extractedParams.appName,
      extractedParams.dockerImageName,
      extractedParams.dockerTag,
      extractedParams.containerPort,
      extractedParams.resourceType,
      extractedParams.resourceCount,
      extractedParams.multiplier,
      extractedParams.balance,
      extractedParams.environmentVariables
    );

    res.send(response);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing your request' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
