"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishableArticleWhere = exports.isHouseProfile = void 0;
exports.mayPublishPost = mayPublishPost;
exports.claimablePostWhere = claimablePostWhere;
exports.profilesForPostWhere = profilesForPostWhere;
const isHouseProfile = (profile) => !profile.ownerId || profile.owner?.role === 'ADMIN';
exports.isHouseProfile = isHouseProfile;
const sharedWith = (post) => post.article?.source.access.map((a) => a.userId) ?? [];
function mayPublishPost(profile, post) {
    if (post.profileId)
        return post.profileId === profile.id;
    if (post.ownerId && post.ownerId === profile.ownerId)
        return true;
    if (profile.ownerId && sharedWith(post).includes(profile.ownerId))
        return true;
    return (!post.ownerId || post.owner?.role === 'ADMIN') && (0, exports.isHouseProfile)(profile);
}
function claimablePostWhere(profile) {
    return {
        OR: [
            { profileId: profile.id },
            {
                profileId: null,
                OR: [
                    ...(profile.ownerId
                        ? [
                            { ownerId: profile.ownerId },
                            { article: { source: { access: { some: { userId: profile.ownerId } } } } },
                        ]
                        : []),
                    ...((0, exports.isHouseProfile)(profile) ? [{ ownerId: null }, { owner: { role: 'ADMIN' } }] : []),
                ],
            },
        ],
    };
}
function profilesForPostWhere(post) {
    const shared = sharedWith(post);
    const sharedProfiles = shared.length ? [{ ownerId: { in: shared } }] : [];
    if (post.ownerId && post.owner?.role !== 'ADMIN') {
        return { OR: [{ ownerId: post.ownerId }, ...sharedProfiles] };
    }
    return {
        OR: [
            { ownerId: null },
            { owner: { role: 'ADMIN' } },
            ...(post.ownerId ? [{ ownerId: post.ownerId }] : []),
            ...sharedProfiles,
        ],
    };
}
exports.publishableArticleWhere = {
    OR: [{ articleId: null }, { article: { status: 'ACTIVE', source: { pausedAt: null } } }],
};
//# sourceMappingURL=claimable.js.map