import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

// R2クライアントの初期化
const R2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
});

export async function POST(request: Request) {
    try {
        const { filename, contentType } = await request.json();

        // ファイル名をユニークにする (例: uploads/ユニークID-元のファイル名)
        const uniqueId = uuidv4();
        const storageKey = `uploads/${uniqueId}-${filename}`;

        // R2へのアップロード用コマンド作成
        const command = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: storageKey,
            ContentType: contentType,
        });

        // 署名付きURLの発行 (有効期限: 5分)
        const signedUrl = await getSignedUrl(R2, command, { expiresIn: 300 });

        // 公開用URLの構築 (R2のパブリックドメインを使用)
        const publicUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_DOMAIN}/${storageKey}`;

        return NextResponse.json({
            signedUrl,
            storageKey,
            publicUrl,
        });

    } catch (error) {
        console.error('Error generating signed URL:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}