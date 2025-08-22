import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Pda } from "../target/types/pda";
import { PublicKey, Keypair } from "@solana/web3.js";
import { expect } from "chai";


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

    // 创建第二个用户用于测试评论功能
    const secondUser = Keypair.generate();
    const [secondUserMessagePda, _] = PublicKey.findProgramAddressSync(
        [Buffer.from("message"), secondUser.publicKey.toBuffer()],
        program.programId
    );

    console.log("Message PDA:", messagePda.toBase58(),"bump:", messageBump);
    console.log("Second User:", secondUser.publicKey.toBase58());
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
    it("Add Comment to Message", async () => {
        // 为第二个用户空投SOL
        const airdropTx = await connection.requestAirdrop(secondUser.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
        await connection.confirmTransaction(airdropTx);
        
        // 等待一下确保空投完成
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 获取评论PDA
        const messageAccount = await program.account.messageAccount.fetch(messagePda);
        const [commentPda, _] = PublicKey.findProgramAddressSync(
            [Buffer.from("comment"), messagePda.toBuffer(), Buffer.from([messageAccount.commentCount])],
            program.programId
        );

        const content = "This is a great post!";
        const transactionSignature = await program.methods
            .addComment(content)
            .accounts({
                user: secondUser.publicKey,
                messageAccount: messagePda,
                commentAccount: commentPda,
            })
            .signers([secondUser])
            .rpc();

        // 验证评论账户
        const commentAccount = await program.account.commentAccount.fetch(commentPda);
        console.log("Comment Account:", JSON.stringify(commentAccount, null, 2));
        expect(commentAccount.content).to.equal(content);
        expect(commentAccount.user.toString()).to.equal(secondUser.publicKey.toString());

        // 验证消息账户的评论数增加了
        const updatedMessageAccount = await program.account.messageAccount.fetch(messagePda);
        expect(updatedMessageAccount.commentCount).to.equal(1);
        
        console.log("Add Comment Transaction Signature:", transactionSignature);
    });

    it("Like a Message", async () => {
        // 获取点赞PDA
        const [likePda, _] = PublicKey.findProgramAddressSync(
            [Buffer.from("like"), messagePda.toBuffer(), secondUser.publicKey.toBuffer()],
            program.programId
        );

        const transactionSignature = await program.methods
            .likeMessage()
            .accounts({
                user: secondUser.publicKey,
                messageAccount: messagePda,
                likeAccount: likePda,
            })
            .signers([secondUser])
            .rpc();

        // 验证点赞账户
        const likeAccount = await program.account.likeAccount.fetch(likePda);
        expect(likeAccount.user.toString()).to.equal(secondUser.publicKey.toString());
        expect(likeAccount.messagePda.toString()).to.equal(messagePda.toString());

        // 验证消息账户的点赞数增加了
        const messageAccount = await program.account.messageAccount.fetch(messagePda);
        expect(messageAccount.likes.toString()).to.equal("1");

        console.log("Like Message Transaction Signature:", transactionSignature);
        console.log("Message likes:", messageAccount.likes.toString());
    });

    it("Unlike a Message", async () => {
        // 获取点赞PDA
        const [likePda, _] = PublicKey.findProgramAddressSync(
            [Buffer.from("like"), messagePda.toBuffer(), secondUser.publicKey.toBuffer()],
            program.programId
        );

        const transactionSignature = await program.methods
            .unlikeMessage()
            .accounts({
                user: secondUser.publicKey,
                messageAccount: messagePda,
                likeAccount: likePda,
            })
            .signers([secondUser])
            .rpc();

        // 验证点赞账户已被删除
        try {
            await program.account.likeAccount.fetch(likePda);
            throw new Error("Like account should have been deleted");
        } catch (error) {
            // 这是预期的，因为账户应该已经被删除
            console.log("Like account successfully deleted");
        }

        // 验证消息账户的点赞数减少了
        const messageAccount = await program.account.messageAccount.fetch(messagePda);
        expect(messageAccount.likes.toString()).to.equal("0");

        console.log("Unlike Message Transaction Signature:", transactionSignature);
    });

    it("Add Admin", async () => {
        // 创建管理员PDA
        const [adminPda, _] = PublicKey.findProgramAddressSync(
            [Buffer.from("admin"), secondUser.publicKey.toBuffer()],
            program.programId
        );

        const transactionSignature = await program.methods
            .addAdmin()
            .accounts({
                authority: wallet.publicKey,
                newAdmin: secondUser.publicKey,
                adminAccount: adminPda,
            })
            .rpc();

        // 验证管理员账户
        const adminAccount = await program.account.adminAccount.fetch(adminPda);
        expect(adminAccount.user.toString()).to.equal(secondUser.publicKey.toString());

        console.log("Add Admin Transaction Signature:", transactionSignature);
        console.log("Admin Account:", JSON.stringify(adminAccount, null, 2));
    });

    it("Flag Message as Admin", async () => {
        // 获取管理员PDA
        const [adminPda, _] = PublicKey.findProgramAddressSync(
            [Buffer.from("admin"), secondUser.publicKey.toBuffer()],
            program.programId
        );

        const transactionSignature = await program.methods
            .flagMessage()
            .accounts({
                admin: secondUser.publicKey,
                adminAccount: adminPda,
                messageAccount: messagePda,
            })
            .signers([secondUser])
            .rpc();

        // 验证消息已被标记
        const messageAccount = await program.account.messageAccount.fetch(messagePda);
        expect(messageAccount.isFlagged).to.be.true;

        console.log("Flag Message Transaction Signature:", transactionSignature);
        console.log("Message flagged:", messageAccount.isFlagged);
    });

    it("Should fail to update flagged message", async () => {
        try {
            await program.methods
                .update("This should fail")
                .accounts({
                    messageAccount: messagePda,
                    vaultAccount: vaultPda,
                })
                .rpc();
            throw new Error("Should have failed to update flagged message");
        } catch (error: any) {
            console.log("Successfully prevented update of flagged message");
            // 检查是否包含MessageFlagged错误或相关错误信息
            const errorMsg = error.toString() || error.message || '';
            const hasExpectedError = errorMsg.includes("MessageFlagged") || 
                                   errorMsg.includes("6006") || // MessageFlagged的错误代码
                                   errorMsg.includes("Message has been flagged");
            if (!hasExpectedError) {
                console.log("Error details:", errorMsg);
            }
            expect(hasExpectedError).to.be.true;
        }
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
