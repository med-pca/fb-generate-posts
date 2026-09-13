import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const posts = [
  {
    title: 'Commencer petit, avancer chaque jour',
    description:
      "Les grands projets commencent souvent par une petite action. Choisissez aujourd'hui une tâche simple, terminez-la, puis construisez la suite pas à pas.",
    url: 'https://example.com/commencer-petit',
    delay: 12,
  },
  {
    title: 'Trois priorités pour une journée productive',
    description:
      'Notez vos trois tâches les plus importantes avant de commencer. Cette méthode simple aide à rester concentré et à mesurer les progrès en fin de journée.',
    url: 'https://example.com/priorites',
    delay: 18,
  },
  {
    title: 'La régularité fait la différence',
    description:
      'Mieux vaut publier régulièrement du contenu utile que chercher la perfection. Écoutez les retours de votre communauté et améliorez chaque nouvelle publication.',
    url: 'https://example.com/regularite',
    delay: 24,
  },
  {
    title: 'Une idée claire vaut mieux que dix idées floues',
    description:
      'Avant de lancer un projet, résumez sa valeur en une phrase. Si elle est facile à comprendre, vos clients comprendront plus rapidement ce que vous leur apportez.',
    url: 'https://example.com/idee-claire',
    delay: 30,
  },
  {
    title: 'Apprendre de ses résultats',
    description:
      'Chaque résultat apporte une information utile. Analysez ce qui fonctionne, identifiez ce qui doit changer et transformez chaque expérience en prochaine action.',
    url: 'https://example.com/resultats',
    delay: 36,
  },
  {
    title: 'Créer de la valeur avant de vendre',
    description:
      'Partagez une astuce concrète, répondez à une question fréquente ou simplifiez un problème. La confiance se construit lorsque votre contenu aide réellement les autres.',
    url: 'https://example.com/creer-valeur',
    delay: 42,
  },
  {
    title: 'Organiser ses idées simplement',
    description:
      'Gardez un espace unique pour noter vos idées de contenu. Classez-les par thème et développez en priorité celles qui répondent aux besoins de votre audience.',
    url: 'https://example.com/organiser-idees',
    delay: 15,
  },
  {
    title: 'Transformer une question en contenu',
    description:
      "Les questions de votre communauté sont une excellente source d'inspiration. Une question réelle peut devenir un conseil, un tutoriel ou une discussion utile.",
    url: 'https://example.com/question-contenu',
    delay: 21,
  },
  {
    title: 'Mesurer pour mieux décider',
    description:
      "Observez les interactions, les clics et les commentaires. Ces données permettent d'identifier les sujets les plus utiles et de préparer les prochains contenus.",
    url: 'https://example.com/mesurer',
    delay: 27,
  },
  {
    title: 'Simplifier son message',
    description:
      'Un message efficace présente une seule idée principale. Utilisez des phrases courtes, un exemple concret et une conclusion qui invite naturellement à réagir.',
    url: 'https://example.com/message-simple',
    delay: 33,
  },
  {
    title: 'Construire une communauté active',
    description:
      'Posez des questions ouvertes et prenez le temps de répondre aux commentaires. Une communauté grandit lorsque ses membres sentent que leur contribution est appréciée.',
    url: 'https://example.com/communaute',
    delay: 39,
  },
  {
    title: 'Préparer la semaine à venir',
    description:
      'Consacrez quelques minutes à planifier les sujets de la semaine. Une préparation légère réduit le stress et aide à maintenir une publication régulière.',
    url: 'https://example.com/planifier-semaine',
    delay: 45,
  },
];

async function main() {
  const profile = await prisma.profile.upsert({
    where: { externalId: 'demo-profile' },
    update: {},
    create: {
      name: 'Profil Démonstration',
      externalId: 'demo-profile',
      defaultImageUrl:
        'https://placehold.co/1200x630/2563eb/ffffff.png?text=Publication',
      minPostsPerJob: 2,
      maxPostsPerJob: 6,
    },
  });

  const secondProfile = await prisma.profile.upsert({
    where: { externalId: 'demo-profile-secondary' },
    update: {},
    create: {
      name: 'Profil Démonstration 2',
      externalId: 'demo-profile-secondary',
      defaultImageUrl:
        'https://placehold.co/1200x630/16a34a/ffffff.png?text=Publication+2',
      minPostsPerJob: 2,
      maxPostsPerJob: 6,
    },
  });

  const groupDefinitions = [
    {
      externalId: 'demo-group-entrepreneurs',
      name: 'Entrepreneurs Maroc',
      url: 'https://facebook.com/groups/demo-entrepreneurs',
    },
    {
      externalId: 'demo-group-marketing',
      name: 'Marketing Digital Maroc',
      url: 'https://facebook.com/groups/demo-marketing',
    },
    {
      externalId: 'demo-group-business',
      name: 'Business et Productivité',
      url: 'https://facebook.com/groups/demo-business',
    },
  ];

  const groups = [];
  for (const group of groupDefinitions) {
    groups.push(
      await prisma.group.upsert({
        where: { externalId: group.externalId },
        update: { name: group.name, url: group.url },
        create: group,
      }),
    );
  }

  for (const linkedProfile of [profile, secondProfile]) {
    for (const group of groups) {
      await prisma.profileGroup.upsert({
        where: {
          profileId_groupId: {
            profileId: linkedProfile.id,
            groupId: group.id,
          },
        },
        update: { status: 'ACTIVE' },
        create: { profileId: linkedProfile.id, groupId: group.id },
      });
    }
  }

  for (const [index, post] of posts.entries()) {
    const createdPost = await prisma.post.upsert({
      where: {
        sourceType_externalId: {
          sourceType: 'JSON',
          externalId: `demo-post-${String(index + 1).padStart(2, '0')}`,
        },
      },
      update: post,
      create: {
        ...post,
        profileId: profile.id,
        sourceType: 'JSON',
        externalId: `demo-post-${String(index + 1).padStart(2, '0')}`,
      },
    });

    for (const group of groups) {
      await prisma.postTarget.upsert({
        where: {
          postId_groupId: { postId: createdPost.id, groupId: group.id },
        },
        update: {},
        create: { postId: createdPost.id, groupId: group.id },
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        profiles: [profile, secondProfile].map(({ id, name }) => ({
          id,
          name,
        })),
        groups: groups.map(({ id, name }) => ({ id, name })),
        posts: posts.length,
        targets: posts.length * groups.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
