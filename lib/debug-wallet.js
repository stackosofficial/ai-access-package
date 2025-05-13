const { ethers } = require('ethers');

function testWallet(privateKey) {
  try {
    console.log('Testing wallet creation with private key');
    console.log('Private key length:', privateKey.length);
    console.log('Private key starts with:', privateKey.substring(0, 4));
    
    // Try with potential prefix removal
    let processedKey = privateKey;
    if (privateKey.startsWith('0x')) {
      console.log('Trying without 0x prefix...');
      processedKey = privateKey.substring(2);
    }
    
    // First try direct initialization
    try {
      const wallet = new ethers.Wallet(privateKey);
      console.log('✅ Wallet created successfully with original key');
      console.log('Wallet address:', wallet.address);
      return true;
    } catch (error) {
      console.error('❌ Failed with original key:', error.message);
      
      // Try with processed key
      try {
        const wallet = new ethers.Wallet(processedKey);
        console.log('✅ Wallet created successfully with processed key');
        console.log('Wallet address:', wallet.address);
        return true;
      } catch (error) {
        console.error('❌ Failed with processed key:', error.message);
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error testing wallet:', error);
    return false;
  }
}

module.exports = { testWallet }; 