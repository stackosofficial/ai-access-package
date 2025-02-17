import { AccountNFT, APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { apiCallWrapper } from "@decloudlabs/skynet/lib/utils/utils";
import ENVConfig from "./envConfig";
import { NFTCosts } from "./types/types";
import * as admin from "firebase-admin";
import { Firestore, Transaction } from "firebase-admin/firestore";

export default class ServerBalanceDatabaseService {
  private envConfig: ENVConfig;
  private db: Firestore | null = null;

  constructor(envConfig: ENVConfig) {
    this.envConfig = envConfig;
  }

  setup = async () => {
    await this.setupDatabase();
  };

  private getCollectionRef() {
    if (!this.db) throw new Error("Database not initialized");
    return this.db.collection(
      "nft_extract_costs_" + this.envConfig.env.SUBNET_ID
    );
  }

  private async runTransaction<T>(
    operation: (transaction: Transaction) => Promise<T>
  ): Promise<T> {
    if (!this.db) throw new Error("Database not initialized");
    return this.db.runTransaction(operation);
  }

  private getNFTId(accountNFT: AccountNFT): string {
    return `${accountNFT.collectionID}_${accountNFT.nftID}`;
  }

  setExtractBalance = async (
    accountNFT: AccountNFT,
    price: string
  ): Promise<APICallReturn<number>> => {
    try {
      const docRef = this.getCollectionRef().doc(this.getNFTId(accountNFT));
      await docRef.set(
        {
          collection_id: accountNFT.collectionID,
          nft_id: accountNFT.nftID,
          costs: price,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return { success: true, data: 1 };
    } catch (error) {
      return { success: false, data: error as Error };
    }
  };

  getExtractBalance = async (
    accountNFT: AccountNFT
  ): Promise<APICallReturn<NFTCosts | null>> => {
    try {
      const docRef = this.getCollectionRef().doc(this.getNFTId(accountNFT));
      const doc = await docRef.get();

      if (!doc.exists) return { success: true, data: null };

      const data = doc.data()!;
      return {
        success: true,
        data: {
          accountNFT: {
            collectionID: data.collection_id,
            nftID: data.nft_id,
          },
          costs: data.costs,
        },
      };
    } catch (error) {
      return { success: false, data: error as Error };
    }
  };

  async *getNFTExtractCursor() {
    const snapshot = await this.getCollectionRef()
      .where("costs", ">", "0")
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      yield {
        accountNFT: {
          collectionID: data.collection_id,
          nftID: data.nft_id,
        },
        costs: data.costs,
      } as NFTCosts;
    }
  }

  deleteNFTExtract = async (accountNFTs: AccountNFT[]) => {
    try {
      const batch = this.db!.batch();
      for (const nft of accountNFTs) {
        const docRef = this.getCollectionRef().doc(this.getNFTId(nft));
        batch.delete(docRef);
      }
      await batch.commit();
      return { success: true, data: accountNFTs.length };
    } catch (error) {
      return { success: false, data: error as Error };
    }
  };

  setupDatabase = async () => {
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } =
      this.envConfig.env;
    if (
      !FIREBASE_PROJECT_ID ||
      !FIREBASE_CLIENT_EMAIL ||
      !FIREBASE_PRIVATE_KEY
    ) {
      throw new Error("Firebase credentials not configured");
    }

    try {
      // Check if Firebase is already initialized
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: FIREBASE_PROJECT_ID,
            clientEmail: FIREBASE_CLIENT_EMAIL,
            privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
          }),
          // Add SSL configuration
          databaseURL: `https://${FIREBASE_PROJECT_ID}.firebaseio.com`,
        });
      }

      this.db = admin.firestore();

      // Configure Firestore settings
      this.db.settings({
        ignoreUndefinedProperties: true,
        ssl: true,
      });

      console.log("Connected to Firebase Firestore");
    } catch (error: any) {
      console.error("Error initializing Firebase:", error);
      throw new Error(`Failed to initialize Firebase: ${error.message}`);
    }
  };

  update = async () => {};

  getClient = async () => {
    if (!this.db) throw new Error("Database not initialized");
    return this.db;
  };
}
