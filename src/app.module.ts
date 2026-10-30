import { WordpressModule } from './wordpress/wordpress.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GroupsModule } from './groups/groups.module';
import { GenerationModule } from './generation/generation.module';
import { ImportsModule } from './imports/imports.module';
import { JobsModule } from './jobs/jobs.module';
import { LogsModule } from './logs/logs.module';
import { PostsModule } from './posts/posts.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ArticlesModule } from './articles/articles.module';
import { SettingsModule } from './settings/settings.module';
import { AuthModule } from './auth/auth.module';
import { IngestModule } from './ingest/ingest.module';
import { SitesModule } from './sites/sites.module';
import { SiteRelayModule } from './site-relay/site-relay.module';
import { UsersModule } from './users/users.module';
import { AccessModule } from './access/access.module';
import { RunnersModule } from './runners/runners.module';
import { CategoriesModule } from './categories/categories.module';
import { InsightsModule } from './insights/insights.module';
import { VerifyModule } from './verify/verify.module';
import { BulkModule } from './bulk/bulk.module';
import { ModeratorsModule } from './moderators/moderators.module';
import { ExtensionsModule } from './extensions/extensions.module';
import { LanguagesModule } from './languages/languages.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { TopArticlesModule } from './top-articles/top-articles.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    PrismaModule,
    ProfilesModule,
    GroupsModule,
    PostsModule,
    GenerationModule,
    ImportsModule,
    JobsModule,
    LogsModule,
    ArticlesModule,
    SettingsModule,
    WordpressModule,
    IngestModule,
    SitesModule,
    SiteRelayModule,
    UsersModule,
    AccessModule,
    RunnersModule,
    CategoriesModule,
    InsightsModule,
    VerifyModule,
    BulkModule,
    ModeratorsModule,
    ExtensionsModule,
    LanguagesModule,
    CampaignsModule,
    AnalyticsModule,
    TopArticlesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
