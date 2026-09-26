"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const wordpress_module_1 = require("./wordpress/wordpress.module");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const groups_module_1 = require("./groups/groups.module");
const generation_module_1 = require("./generation/generation.module");
const imports_module_1 = require("./imports/imports.module");
const jobs_module_1 = require("./jobs/jobs.module");
const logs_module_1 = require("./logs/logs.module");
const posts_module_1 = require("./posts/posts.module");
const prisma_module_1 = require("./prisma/prisma.module");
const profiles_module_1 = require("./profiles/profiles.module");
const articles_module_1 = require("./articles/articles.module");
const settings_module_1 = require("./settings/settings.module");
const auth_module_1 = require("./auth/auth.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            auth_module_1.AuthModule,
            prisma_module_1.PrismaModule,
            profiles_module_1.ProfilesModule,
            groups_module_1.GroupsModule,
            posts_module_1.PostsModule,
            generation_module_1.GenerationModule,
            imports_module_1.ImportsModule,
            jobs_module_1.JobsModule,
            logs_module_1.LogsModule,
            articles_module_1.ArticlesModule,
            settings_module_1.SettingsModule,
            wordpress_module_1.WordpressModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map