import dotenv from 'dotenv';
dotenv.config();

import express from 'express';

import cors from 'cors';
import { checkBalance } from './middleware/checkBalance';
import { protect } from './middleware/auth';
import bodyParser from 'body-parser';
import { createApp } from './createApp';


const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());


app.post('/request', protect, checkBalance, async (req, res) => {
  try {
    const { projectId, appName, dockerImageName, dockerTag, containerPort, resourceType, resourceCount, multiplier, balance, subnetId, environmentVariables } = req.body;
    const repsonse = await createApp(projectId, appName, dockerImageName, dockerTag, containerPort, resourceType, resourceCount, multiplier, balance, subnetId, environmentVariables);
    res.send(repsonse);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing your request' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
