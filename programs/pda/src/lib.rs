#![allow(deprecated)]
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("DEETHavBj7a72rrfwbR4h6iwXqA5mf9mkti8b7LQyn2F");

#[program]
pub mod pda {
    use super::*;

    pub fn create(ctx: Context<Create>, message: String) -> Result<()> {
        require!(!message.is_empty(), ErrorCode::EmptyContent);
        require!(message.len() <= 500, ErrorCode::ContentTooLong);
        
        msg!("Create Message: {}", message);
        let account_data = &mut ctx.accounts.message_account;
        account_data.user = ctx.accounts.user.key();
        account_data.message = message;
        account_data.likes = 0;
        account_data.comment_count = 0;
        account_data.is_flagged = false;
        account_data.created_at = Clock::get()?.unix_timestamp;
        account_data.bump = ctx.bumps.message_account;
        Ok(())
    }

    pub fn update(ctx: Context<Update>, message: String) -> Result<()> {
        require!(!message.is_empty(), ErrorCode::EmptyContent);
        require!(message.len() <= 500, ErrorCode::ContentTooLong);
        require!(!ctx.accounts.message_account.is_flagged, ErrorCode::MessageFlagged);
        
        msg!("Update Message: {}", message);
        let account_data = &mut ctx.accounts.message_account;
        account_data.message = message;

        let transfer_accounts = Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.vault_account.to_account_info(),
        };
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_accounts,
        );
        transfer(cpi_context, 1_000_000)?;
        Ok(())
    }

    pub fn delete(ctx: Context<Delete>) -> Result<()> {
        msg!("Delete Message");
        let user_key = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] = &[&[b"vault", user_key.as_ref(), &[ctx.bumps.vault_account]]];

        let transfer_accounts = Transfer {
            from: ctx.accounts.vault_account.to_account_info(),
            to: ctx.accounts.user.to_account_info(),
        };
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_accounts,
        ).with_signer(signer_seeds);
        transfer(cpi_context, ctx.accounts.vault_account.lamports())?;

       Ok(())
    }

    // 添加评论功能
    pub fn add_comment(ctx: Context<AddComment>, content: String) -> Result<()> {
        require!(!content.is_empty(), ErrorCode::EmptyContent);
        require!(content.len() <= 200, ErrorCode::ContentTooLong);
        require!(!ctx.accounts.message_account.is_flagged, ErrorCode::MessageFlagged);
        
        let message_pda = ctx.accounts.message_account.key();
        let comment = &mut ctx.accounts.comment_account;
        let message = &mut ctx.accounts.message_account;
        
        comment.user = ctx.accounts.user.key();
        comment.message_pda = message_pda;
        comment.content = content;
        comment.created_at = Clock::get()?.unix_timestamp;
        comment.bump = ctx.bumps.comment_account;
        
        message.comment_count = message.comment_count.checked_add(1)
            .ok_or(ErrorCode::CommentOverflow)?;
            
        Ok(())
    }
    
    // 点赞功能
    pub fn like_message(ctx: Context<LikeMessage>) -> Result<()> {
        require!(!ctx.accounts.message_account.is_flagged, ErrorCode::MessageFlagged);
        
        let like = &mut ctx.accounts.like_account;
        let message = &mut ctx.accounts.message_account;
        
        like.user = ctx.accounts.user.key();
        like.message_pda = message.key();
        like.bump = ctx.bumps.like_account;
        
        message.likes = message.likes.checked_add(1)
            .ok_or(ErrorCode::LikeOverflow)?;
            
        Ok(())
    }
    
    // 取消点赞
    pub fn unlike_message(ctx: Context<UnlikeMessage>) -> Result<()> {
        let message = &mut ctx.accounts.message_account;
        
        message.likes = message.likes.checked_sub(1)
            .ok_or(ErrorCode::LikeUnderflow)?;
            
        // 点赞账户会通过close参数自动关闭
        Ok(())
    }
    
    // 管理员标记消息
    pub fn flag_message(ctx: Context<FlagMessage>) -> Result<()> {
        let message = &mut ctx.accounts.message_account;
        message.is_flagged = true;
        msg!("Message flagged by admin: {}", ctx.accounts.admin.key());
        Ok(())
    }
    
    // 添加管理员
    pub fn add_admin(ctx: Context<AddAdmin>) -> Result<()> {
        let admin = &mut ctx.accounts.admin_account;
        admin.user = ctx.accounts.new_admin.key();
        admin.bump = ctx.bumps.admin_account;
        msg!("Admin added: {}", ctx.accounts.new_admin.key());
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(message: String)]
pub struct Create<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        seeds = [b"message", user.key().as_ref()],
        bump,
        payer = user,
        space = 8 + 32 + 4 + message.len() + 8 + 1 + 1 + 8 + 1
    )]
    pub message_account: Account<'info, MessageAccount>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
#[instruction(message: String)]
pub struct Update<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump,
    )]
    pub vault_account: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [b"message", user.key().as_ref()],
        bump = message_account.bump,
        has_one = user,
        realloc = 8 + 32 + 4 + message.len() + 8 + 1 + 1 + 8 + 1,
        realloc::payer = user,
        realloc::zero = true,
    )]
    pub message_account: Account<'info, MessageAccount>,
    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
pub struct Delete<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump
    )]
    pub vault_account: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [b"message", user.key().as_ref()],
        bump = message_account.bump,
        has_one = user,
        close = user,
    )]
    pub message_account: Account<'info, MessageAccount>,
    pub system_program: Program<'info, System>
}


#[account]
pub struct MessageAccount {
    pub user: Pubkey,
    pub message: String,
    pub likes: u64,
    pub comment_count: u8,
    pub is_flagged: bool,
    pub created_at: i64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct AddComment<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"message", message_account.user.as_ref()],
        bump = message_account.bump,
    )]
    pub message_account: Account<'info, MessageAccount>,
    
    #[account(
        init,
        seeds = [b"comment", message_account.key().as_ref(), &[message_account.comment_count]],
        bump,
        payer = user,
        space = 8 + 32 + 32 + 4 + 200 + 8 + 1
    )]
    pub comment_account: Account<'info, CommentAccount>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LikeMessage<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"message", message_account.user.as_ref()],
        bump = message_account.bump,
    )]
    pub message_account: Account<'info, MessageAccount>,
    
    #[account(
        init,
        seeds = [b"like", message_account.key().as_ref(), user.key().as_ref()],
        bump,
        payer = user,
        space = 8 + 32 + 32 + 1
    )]
    pub like_account: Account<'info, LikeAccount>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnlikeMessage<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"message", message_account.user.as_ref()],
        bump = message_account.bump,
    )]
    pub message_account: Account<'info, MessageAccount>,
    
    #[account(
        mut,
        seeds = [b"like", message_account.key().as_ref(), user.key().as_ref()],
        bump = like_account.bump,
        close = user
    )]
    pub like_account: Account<'info, LikeAccount>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FlagMessage<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        seeds = [b"admin", admin.key().as_ref()],
        bump = admin_account.bump,
    )]
    pub admin_account: Account<'info, AdminAccount>,
    
    #[account(
        mut,
        seeds = [b"message", message_account.user.as_ref()],
        bump = message_account.bump,
    )]
    pub message_account: Account<'info, MessageAccount>,
}

#[derive(Accounts)]
pub struct AddAdmin<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: This is the new admin user
    pub new_admin: UncheckedAccount<'info>,
    
    #[account(
        init,
        seeds = [b"admin", new_admin.key().as_ref()],
        bump,
        payer = authority,
        space = 8 + 32 + 1
    )]
    pub admin_account: Account<'info, AdminAccount>,
    
    pub system_program: Program<'info, System>,
}

// 新增账户结构
#[account]
pub struct CommentAccount {
    pub user: Pubkey,
    pub message_pda: Pubkey,
    pub content: String,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
pub struct LikeAccount {
    pub user: Pubkey,
    pub message_pda: Pubkey,
    pub bump: u8,
}

#[account]
pub struct AdminAccount {
    pub user: Pubkey,
    pub bump: u8,
}

// 错误代码
#[error_code]
pub enum ErrorCode {
    #[msg("Content cannot be empty")]
    EmptyContent,
    
    #[msg("Content exceeds maximum length")]
    ContentTooLong,
    
    #[msg("Comment count overflow")]
    CommentOverflow,
    
    #[msg("Like count overflow")]
    LikeOverflow,
    
    #[msg("Like count underflow")]
    LikeUnderflow,
    
    #[msg("Message has been flagged and cannot be modified")]
    MessageFlagged,
}
