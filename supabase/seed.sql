-- Insert news categories
insert into public.categories (name)
values
  ('Business'),
  ('Technology'),
  ('Sports'),
  ('Entertainment'),
  ('Health')
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
   'Health', 510, 65, 8)
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