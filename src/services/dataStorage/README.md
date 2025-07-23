# Data Storage Service

Basic data storage functionality for AI Access Point SDK.

## Installation

```bash
npm install ai-access-package
```

## Setup

### Environment Variables

```env
POSTGRES_URL=postgresql://username:password@localhost:5432/database
SUBNET_ID=your-subnet-id
```

### Basic Usage

```typescript
import { initAIAccessPoint } from 'ai-access-package';

// Initialize the SDK
const result = await initAIAccessPoint(
  env, 
  skyNode, 
  app, 
  runNaturalFunction, 
  true, 
  upload
);
```

## Store Data

Access points can store data using the internal function:

```typescript
import { getDataStorageService } from 'ai-access-package';

const dataStorageService = getDataStorageService();
await dataStorageService?.storeData(
  'service-name',
  'collection-id', 
  'nft-id',
  'reference-id',
  { data: 'to store' }
);
```

## Fetch Data

Use the API endpoint to retrieve stored data:

```bash
GET /fetch-data/:referenceId
```

Response:
```json
{
  "success": true,
  "data": {
    "serviceName": "string",
    "data": "any",
    "createdAt": "date",
    "updatedAt": "date"
  }
}
```

## Custom Validation

Add custom validation during initialization:

```typescript
const customValidation = async (data, accountNFT, serviceName, referenceId) => {
  // Your validation logic
  return { isValid: true, transformedData: data };
};

const result = await initAIAccessPoint(
  env, skyNode, app, runNaturalFunction, true, upload,
  { dataStorageValidationFunction: customValidation }
);
``` 