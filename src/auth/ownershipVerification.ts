import SkyMainNodeJS from '@decloudlabs/skynet/lib/services/SkyMainNodeJS';
import { ethers } from 'ethers';

export async function validateAgentCollection(
    agentCollection: string,
    agentId: string | null,
    userAddress: string,
    skyNode: SkyMainNodeJS
): Promise<boolean> {
    try {
        const contractService = skyNode.contractService;
        const agentCollectionEthers = new ethers.Contract(agentCollection, contractService.AgentNFT.interface, skyNode.signerService.signer);
        if (agentId) {
            const owner = await agentCollectionEthers.ownerOf(agentId);
            if (owner.toLowerCase() === userAddress.toLowerCase()) {
                return true;
            }
        }
        const [DEFAULT_ADMIN_ROLE] = await Promise.all([
            agentCollectionEthers.DEFAULT_ADMIN_ROLE()
        ]);
        
        const [hasAdminRole] = await Promise.all([
            agentCollectionEthers.hasRole(DEFAULT_ADMIN_ROLE, userAddress),
        ]);
        
        return hasAdminRole;
    } catch (error: any) {
        console.error('❌ Error validating agent collection:', error);
        return false;
    }
}

export async function validateAccountNFT(
    collectionID: string,
    nftID: string,
    userAddress: string,
    skyNode: SkyMainNodeJS
): Promise<boolean> {
    try {
        if (!skyNode) {
            console.error('❌ validateAccountNFT: SkyNode is not available');
            throw new Error('SkyNode is not available');
        }
        const accountNFT = {
            collectionID,
            nftID
        };

        const ownerAddress = await skyNode.contractService.CollectionNFT.ownerOf(
            accountNFT
        );
        
        const isValid = ownerAddress.toLowerCase() === userAddress.toLowerCase();
        if (isValid) {
            console.log(`✅ AccountNFT ownership verified for wallet: ${userAddress}`);
        }
        return isValid;
    } catch (error) {
        console.error('❌ Error validating account NFT:', error);
        return false;
    }
}