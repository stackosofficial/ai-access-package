import { AuthService } from '../src/services/authService';
import { Pool } from 'pg';

// Example implementation of AuthService for a specific service (e.g., Gmail)
export class GmailAuthService extends AuthService {
  constructor(pool: Pool) {
    super(pool);
  }

  // Developer implements this method to generate service-specific auth links
  async generateAuthLink(userAddress: string, nftId: string): Promise<string> {
    // Example: Generate Gmail OAuth URL
    const clientId = process.env.GOOGLE_CLIENT_ID || 'your-client-id';
    const redirectUri = process.env.AUTH_CALLBACK_URL || 'http://localhost:3000/auth/callback';
    const scope = 'https://www.googleapis.com/auth/gmail.readonly';
    
    const authUrl = `https://accounts.google.com/oauth/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${userAddress}:${nftId}`; // Use userAddress:nftId as state
    
    return authUrl;
  }
}

// Example usage in your main application
export async function setupAuthExample() {
  // Create database connection
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL 
  });

  // Create your custom auth service
  const gmailAuthService = new GmailAuthService(pool);

  // Initialize the table
  await gmailAuthService.initTable();

  // Example: Save auth data after OAuth callback
  const userAddress = '0x1234567890abcdef';
  const nftId = '53';
  
  // Save any type of auth data
  await gmailAuthService.saveAuth(userAddress, nftId, {
    access_token: 'ya29.a0...',
    refresh_token: '1//04...',
    expires_at: Date.now() + 3600000,
    email: 'user@gmail.com',
    scope: 'https://www.googleapis.com/auth/gmail.readonly'
  });

  // Check auth status
  const isAuthenticated = await gmailAuthService.checkAuthStatus(userAddress, nftId);
  console.log('Is authenticated:', isAuthenticated); // true

  // Get auth data
  const authData = await gmailAuthService.getAuth(userAddress, nftId);
  console.log('Auth data:', authData);

  // Generate auth link
  const authLink = await gmailAuthService.generateAuthLink(userAddress, nftId);
  console.log('Auth link:', authLink);
}

// Example natural function that uses auth data
export async function yourNaturalFunction(req: any, res: any, balanceRunMain: any, responseHandler: any) {
  const { userAuthPayload, accountNFT } = req.body;
  const userAddress = userAuthPayload.userAddress;
  const nftId = accountNFT.nftID;

  // Get auth service instance
  const { getAuthService } = await import('../src/init');
  const authService = getAuthService();

  if (authService) {
    // Check if user is authenticated
    const isAuthenticated = await authService.checkAuthStatus(userAddress, nftId);
    
    if (!isAuthenticated) {
      responseHandler.sendError('Authentication required', 401);
      return;
    }

    // Get auth data
    const authData = await authService.getAuth(userAddress, nftId);
    
    // Use auth data in your service logic
    console.log('Using auth data:', authData);
    
    // Your service logic here...
    responseHandler.sendFinalResponse({
      success: true,
      data: { message: 'Service completed with auth data' }
    });
  }
}

/*
// Example of how to use with the SDK (commented out due to import issues)
// To use this, you would need to:
// 1. Import the required modules at the top level
// 2. Create your custom auth service
// 3. Pass it to initAIAccessPoint in the config

const env = {
  JSON_RPC_PROVIDER: process.env.PROVIDER_RPC!,
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY!,
  SUBNET_ID: process.env.SUBNET_ID!,
  POSTGRES_URL: process.env.DATABASE_URL!,
  SERVER_COST_CONTRACT_ADDRESS: process.env.SERVER_COST_CONTRACT_ADDRESS!,
};

// Initialize SDK with your auth service
await initAIAccessPoint(
  env,
  skyNode,
  app,
  yourNaturalFunction,
  true,
  undefined,
  {
    authService: gmailAuthService
  }
);

// Now you can use the endpoints:
// POST /auth-link - generates auth link
// POST /auth-status - checks auth status
// And use gmailAuthService.getAuth() and gmailAuthService.saveAuth() in your code
*/ 