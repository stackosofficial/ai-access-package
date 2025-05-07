import ServerBalanceDatabaseService from './src/serverBalanceDatabaseService';
import ENVConfig from './src/envConfig';
import { AccountNFT } from "@decloudlabs/skynet/lib/types/types";

// Test configuration
const testConfig = new ENVConfig({
  JSON_RPC_PROVIDER: 'http://localhost:8545',
  WALLET_PRIVATE_KEY: 'test-key',
  SUBNET_ID: 'test-subnet',
  POSTGRES_URL: process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/test_db',
  SERVER_COST_CONTRACT_ADDRESS: '0x123',
  OPENAI_API_KEY: 'test-key'
});

const testNFT: AccountNFT = {
  collectionID: 'test-collection',
  nftID: 'test-nft'
};

async function runTests() {
  console.log('Starting database tests...');
  const service = new ServerBalanceDatabaseService(testConfig);

  try {
    // Setup
    console.log('\n1. Setting up database...');
    await service.setup();
    console.log('✓ Database setup complete');

    // Test 1: Set and get balance
    console.log('\n2. Testing set and get balance...');
    const setResult = await service.setExtractBalance(testNFT, '100');
    console.log('Set balance result:', setResult);

    const getResult = await service.getExtractBalance(testNFT);
    console.log('Get balance result:', getResult);
    console.log('✓ Set and get balance test complete');

    // Test 2: Update balance
    console.log('\n3. Testing balance update...');
    const updateResult = await service.setExtractBalance(testNFT, '200');
    console.log('Update balance result:', updateResult);

    const getUpdatedResult = await service.getExtractBalance(testNFT);
    console.log('Get updated balance result:', getUpdatedResult);
    console.log('✓ Balance update test complete');

    // Test 3: Get unapplied costs
    console.log('\n4. Testing unapplied costs...');
    const unappliedResult = await service.getUnappliedCosts();
    console.log('Unapplied costs result:', unappliedResult);
    console.log('✓ Unapplied costs test complete');

    // Test 4: Mark costs as applied
    console.log('\n5. Testing mark costs as applied...');
    if (unappliedResult.success && unappliedResult.data && unappliedResult.data.length > 0) {
      const docIds = unappliedResult.data
        .map(cost => cost.docId)
        .filter((id): id is string => id !== undefined);

      const markResult = await service.markCostsAsApplied(docIds);
      console.log('Mark as applied result:', markResult);
    }
    console.log('✓ Mark costs as applied test complete');

    // Test 5: Test cursor
    console.log('\n6. Testing NFT extract cursor...');
    console.log('Iterating through NFT extracts:');
    for await (const item of service.getNFTExtractCursor()) {
      console.log('Found NFT:', item);
    }
    console.log('✓ NFT extract cursor test complete');

    // Test 6: Delete NFT
    console.log('\n7. Testing NFT deletion...');
    const deleteResult = await service.deleteNFTExtract([testNFT]);
    console.log('Delete result:', deleteResult);

    const getAfterDelete = await service.getExtractBalance(testNFT);
    console.log('Get after delete result:', getAfterDelete);
    console.log('✓ NFT deletion test complete');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    console.log('\nAll tests completed!');
  }
}

// Run the tests
runTests().catch(console.error); 