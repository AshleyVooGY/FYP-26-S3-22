-- Insert news categories
insert into public.categories (name)
values
  ('Business'),
  ('Technology'),
  ('Sports'),
  ('Entertainment'),
  ('Health'),
  ('Politics'),
  ('Science'),
  ('Lifestyle'),
  ('Environment')
on conflict (name) do nothing;

-- Insert sample articles for Feature 5 testing
with sample_articles (
  title,
  content,
  category_name,
  view_count,
  reaction_count,
  days_ago
) as (
  values
  ('Businesses Adopt AI Tools',
   'Local businesses are adopting artificial intelligence tools to improve productivity and customer service.',
   'Business', 920, 140, 1),

  ('Markets Record Strong Growth',
   'Regional markets recorded strong growth following positive economic developments.',
   'Business', 1480, 195, 2),

  ('Start-ups Secure New Funding',
   'Several technology start-ups secured funding to expand their products and services.',
   'Business', 730, 88, 3),

  ('Retail Sales Rise This Month',
   'Retail businesses reported increased sales during the latest shopping period.',
   'Business', 560, 62, 4),

  ('Companies Introduce Flexible Work',
   'More companies are introducing flexible working arrangements for their employees.',
   'Business', 1180, 170, 5),

  ('Small Businesses Expand Online',
   'Small businesses are expanding their online presence to reach more customers.',
   'Business', 410, 45, 7),

  ('New Smartphone Technology',
   'New smartphone technology promises improved performance, security and battery life.',
   'Technology', 1350, 220, 1),

  ('Cybersecurity Threats Increase',
   'Security researchers have identified an increase in online threats targeting users.',
   'Technology', 1750, 310, 2),

  ('AI Changes Digital Services',
   'Artificial intelligence is changing how organisations provide digital services.',
   'Technology', 2100, 390, 3),

  ('Cloud Services Gain Popularity',
   'More organisations are adopting cloud services to improve flexibility and efficiency.',
   'Technology', 980, 150, 4),

  ('New Software Update Released',
   'The latest software update introduces performance and security improvements.',
   'Technology', 620, 75, 6),

  ('Students Develop Smart Application',
   'A group of students developed a smart application to address a community problem.',
   'Technology', 840, 105, 8),

  ('National Team Wins Final',
   'The national team secured an exciting victory after a closely contested final match.',
   'Sports', 1900, 360, 1),

  ('Local Club Signs New Player',
   'A local sports club announced the signing of a promising new player.',
   'Sports', 1050, 180, 2),

  ('Athletes Prepare for Tournament',
   'Athletes have begun their final preparations for an upcoming regional tournament.',
   'Sports', 690, 92, 3),

  ('School Team Breaks Record',
   'A school sports team achieved a new record during a national competition.',
   'Sports', 1250, 240, 5),

  ('Community Run Attracts Thousands',
   'Thousands of participants joined a community run promoting healthy living.',
   'Sports', 760, 115, 6),

  ('Coach Announces New Strategy',
   'The team coach announced a new strategy ahead of the coming season.',
   'Sports', 470, 58, 9),

  ('Film Festival Returns',
   'The annual film festival returns with new local and international productions.',
   'Entertainment', 780, 125, 1),

  ('Local Artist Releases Album',
   'A local artist released a highly anticipated album featuring several new songs.',
   'Entertainment', 1600, 330, 2),

  ('Award Show Announces Nominees',
   'The nominees for this year’s entertainment awards have been officially announced.',
   'Entertainment', 1150, 205, 3),

  ('Popular Series Returns',
   'A popular television series is returning with a new season and cast members.',
   'Entertainment', 2200, 440, 4),

  ('Museum Opens New Exhibition',
   'A museum has opened a new exhibition featuring works from emerging artists.',
   'Entertainment', 530, 70, 6),

  ('Theatre Production Opens',
   'A new theatre production has opened and received positive audience responses.',
   'Entertainment', 390, 48, 10),

  ('Simple Ways to Stay Healthy',
   'Health professionals share practical ways to improve physical and mental well-being.',
   'Health', 650, 95, 1),

  ('New Community Clinic Opens',
   'A new community clinic has opened to provide residents with accessible health services.',
   'Health', 880, 120, 2),

  ('Experts Encourage Better Sleep',
   'Health experts highlight the importance of maintaining consistent sleeping habits.',
   'Health', 1450, 275, 3),

  ('Healthy Eating Campaign Begins',
   'A public campaign has been launched to encourage healthier food choices.',
   'Health', 970, 160, 4),

  ('Mental Wellness Programme Expands',
   'A mental wellness programme is expanding its support services across the community.',
   'Health', 1300, 230, 6),

  ('Exercise Supports Daily Wellness',
   'Regular physical activity can support general health and daily well-being.',
   'Health', 510, 65, 8),

  (
    'New Policy Plans Announced',
    'Government officials announced new policy plans aimed at supporting communities and public services.',
    'Politics', 1420, 215, 1
  ),
  (
    'Parliament Debates New Proposal',
    'Lawmakers debated a new proposal during the latest parliamentary session.',
    'Politics', 1860, 305, 2
  ),
  (
    'Public Consultation Opens',
    'Residents are invited to provide feedback on proposed changes through a public consultation.',
    'Politics', 790, 105, 3
  ),
  (
    'Leaders Discuss Regional Cooperation',
    'Regional leaders met to discuss opportunities for stronger economic and social cooperation.',
    'Politics', 1120, 165, 4
  ),
  (
    'New Community Initiative Launched',
    'A new government initiative has been launched to support local community development.',
    'Politics', 640, 78, 6
  ),
  (
    'Youth Forum Discusses Policy',
    'Young participants shared their views on public policy issues during a national youth forum.',
    'Politics', 480, 55, 9
  ),

  (
    'Scientists Discover New Material',
    'Researchers have developed a new material with potential applications in future technologies.',
    'Science', 1680, 290, 1
  ),
  (
    'Space Research Mission Begins',
    'Scientists have launched a new research mission to collect data about space and planetary environments.',
    'Science', 2050, 380, 2
  ),
  (
    'Study Reveals Climate Trends',
    'A new scientific study has identified changing climate patterns observed over recent years.',
    'Science', 1240, 195, 3
  ),
  (
    'Researchers Improve Solar Technology',
    'Researchers have developed improvements that could increase the efficiency of solar energy technology.',
    'Science', 980, 145, 4
  ),
  (
    'Marine Study Finds New Species',
    'Researchers studying marine ecosystems have documented a previously unidentified species.',
    'Science', 750, 98, 6
  ),
  (
    'Students Showcase Science Projects',
    'Students presented innovative research projects during an annual science exhibition.',
    'Science', 430, 52, 8
  ),

  (
    'Simple Habits Improve Daily Routine',
    'Small changes to everyday habits can help people improve productivity and maintain a balanced routine.',
    'Lifestyle', 1380, 225, 1
  ),
  (
    'Minimalist Living Gains Interest',
    'More people are exploring minimalist lifestyles as a way to simplify their homes and daily routines.',
    'Lifestyle', 1020, 155, 2
  ),
  (
    'Home Cooking Becomes Popular',
    'More households are exploring simple home-cooked meals as part of their everyday lifestyle.',
    'Lifestyle', 1740, 315, 3
  ),
  (
    'Weekend Markets Attract Visitors',
    'Local weekend markets are attracting visitors with food, crafts and community activities.',
    'Lifestyle', 890, 130, 4
  ),
  (
    'Simple Tips for Better Organisation',
    'Experts share practical organisation tips for creating more manageable daily routines.',
    'Lifestyle', 610, 72, 6
  ),
  (
    'New Travel Trends Emerge',
    'Travellers are showing greater interest in flexible itineraries and experiences closer to local communities.',
    'Lifestyle', 520, 64, 9
  ),

  (
    'City Expands Green Spaces',
    'New green spaces are being developed across the city to support biodiversity and improve urban living.',
    'Environment', 1520, 260, 1
  ),
  (
    'Recycling Programme Expands',
    'A recycling initiative is expanding to encourage more households to adopt sustainable practices.',
    'Environment', 1080, 170, 2
  ),
  (
    'Clean Energy Projects Increase',
    'New clean energy projects are being introduced as organisations work towards more sustainable operations.',
    'Environment', 1950, 350, 3
  ),
  (
    'Volunteers Lead Coastal Cleanup',
    'Community volunteers gathered to remove waste and protect local coastal environments.',
    'Environment', 870, 125, 4
  ),
  (
    'Tree Planting Campaign Begins',
    'A new tree planting campaign aims to increase greenery and support local ecosystems.',
    'Environment', 690, 86, 6
  ),
  (
    'Schools Promote Sustainability',
    'Schools are introducing activities that encourage students to learn about environmental sustainability.',
    'Environment', 460, 50, 8
  )
)

insert into public.articles (
  title,
  content,
  category_id,
  status,
  view_count,
  reaction_count,
  published_at
)
select
  sample.title,
  sample.content,
  categories.id,
  'published',
  sample.view_count,
  sample.reaction_count,
  now() - make_interval(days => sample.days_ago)
from sample_articles sample
join public.categories categories
  on categories.name = sample.category_name
where not exists (
  select 1
  from public.articles existing
  where existing.title = sample.title
);