import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Pda } from "../target/types/pda";
import { PublicKey } from "@solana/web3.js";


describe("pda", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    // Load your program from the workspace
    const program = anchor.workspace.Pda as anchor.Program;
    const wallet = provider.wallet;
    const connection = provider.connection;
    const [messagePda, messageBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("message"), wallet.publicKey.toBuffer()],
        program.programId
    )

    const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), wallet.publicKey.toBuffer()],
        program.programId
    )

    console.log("Message PDA:", messagePda.toBase58(),"bump:", messageBump);
    it("Create Message Account", async () => {
        const message = "Hello World!";
        const transactionSignature = await program.methods
            .create(message)
            .accounts({
                messageAccount: messagePda
            })
            .rpc();

        // Fetch the account from local validator
        const messageAccount = await program.account.messageAccount.fetch(
            messagePda
        );
        console.log("Create Message Account:",JSON.stringify(messageAccount, null, 2));
        console.log("Create Transaction Signature:",transactionSignature);
    });
    it("Update Message Account", async () => {
        const message = "Hello Victor!";
        const transactionSignature = await program.methods
            .update(message)
            .accounts({
                messageAccount: messagePda,
                vaultAccount: vaultPda,
            })
            .rpc();
	const messageAccount = await program.account.messageAccount.fetch(messagePda);
	console.log("Update Message Account:", JSON.stringify(messageAccount, null, 2));
        const vaultAccountInfo = await connection.getAccountInfo(vaultPda);
        console.log("Vault Account Info:",JSON.stringify(vaultAccountInfo, null, 2));
        console.log("Update Transaction Signature:", transactionSignature);
    });
    it("Delete Message Account", async () => {
        const transactionSignature = await program.methods
            .delete()
            .accounts({
                messageAccount: messagePda,
                vaultAccount: vaultPda,
            })
            .rpc();
        console.log("Delete Transaction Signature:", transactionSignature);
    });
});
