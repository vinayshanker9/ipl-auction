import json, zipfile, collections, pathlib

archive = zipfile.ZipFile('/tmp/ipl_json.zip')
display_names = {
    'V Kohli':'Virat Kohli','RG Sharma':'Rohit Sharma','S Dhawan':'Shikhar Dhawan','DA Warner':'David Warner',
    'SK Raina':'Suresh Raina','AM Rahane':'Ajinkya Rahane','SV Samson':'Sanju Samson','CH Gayle':'Chris Gayle',
    'RV Uthappa':'Robin Uthappa','KD Karthik':'Dinesh Karthik','F du Plessis':'Faf du Plessis','JC Buttler':'Jos Buttler',
    'SA Yadav':'Suryakumar Yadav','AT Rayudu':'Ambati Rayudu','YS Chahal':'Yuzvendra Chahal','B Kumar':'Bhuvneshwar Kumar',
    'SP Narine':'Sunil Narine','DJ Bravo':'Dwayne Bravo','RA Jadeja':'Ravindra Jadeja','R Ashwin':'Ravichandran Ashwin',
    'PP Chawla':'Piyush Chawla','V Suryavanshi':'Vaibhav Suryavanshi','A Singh':'Arshdeep Singh',
    'JJ Bumrah':'Jasprit Bumrah','HH Pandya':'Hardik Pandya','SS Iyer':'Shreyas Iyer',
    'N Pooran':'Nicholas Pooran','K Rabada':'Kagiso Rabada','JC Archer':'Jofra Archer',
    'TA Boult':'Trent Boult','MP Stoinis':'Marcus Stoinis','MR Marsh':'Mitchell Marsh',
    'PJ Cummins':'Pat Cummins','SM Curran':'Sam Curran','MA Starc':'Mitchell Starc',
    'JR Hazlewood':'Josh Hazlewood','AD Russell':'Andre Russell','KA Pollard':'Kieron Pollard',
    'Q de Kock':'Quinton de Kock','N Rana':'Nitish Rana','S Gill':'Shubman Gill',
    'R Pant':'Rishabh Pant','R Parag':'Riyan Parag','LS Livingstone':'Liam Livingstone',
    'S Samson':'Sanju Samson','D Padikkal':'Devdutt Padikkal','R Tripathi':'Rahul Tripathi',
    'A Markram':'Aiden Markram','H Klaasen':'Heinrich Klaasen','T Head':'Travis Head',
    'P Salt':'Phil Salt','J Buttler':'Jos Buttler','H Brook':'Harry Brook',
    'S Narine':'Sunil Narine','R Jadeja':'Ravindra Jadeja','S Yadav':'Suryakumar Yadav',
    'A Sharma':'Abhishek Sharma','V Iyer':'Venkatesh Iyer','R Tewatia':'Rahul Tewatia',
}
all_stats = collections.defaultdict(lambda: collections.Counter())
season_stats = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
season_matches = collections.Counter()
person_labels = collections.defaultdict(set)

def preferred_name(person_id):
    names=person_labels.get(person_id,{person_id})
    return max(names,key=lambda name:(sum(len(part)>1 for part in name.split()),len(name)))

for file in archive.namelist():
    if not file.endswith('.json') or file in ('README.txt', 'LICENSE.txt'):
        continue
    match = json.loads(archive.read(file))
    info = match['info']; season = info['dates'][0][:4]
    season_matches[season] += 1
    registry=info.get('registry',{}).get('people',{})
    def person_id(name):
        person_labels[registry.get(name,name)].add(display_names.get(name,name))
        return registry.get(name,name)
    played = set(person_id(name) for name in sum(info['players'].values(), []))
    for name in played:
        all_stats[name]['matches'] += 1
        season_stats[season][name]['matches'] += 1
    for inning in match['innings']:
        for over in inning['overs']:
            for d in over['deliveries']:
                batter, bowler = person_id(d['batter']), person_id(d['bowler']); runs=d['runs']; extras=d.get('extras', {})
                person_id(d.get('non_striker',d['batter']))
                for scope in (all_stats, season_stats[season]):
                    bs=scope[batter]; ws=scope[bowler]
                    bs['runs'] += runs['batter']
                    if 'wides' not in extras: bs['balls'] += 1
                    bs['fours'] += int(runs['batter']==4); bs['sixes'] += int(runs['batter']==6)
                    ws['conceded'] += runs['total'] - extras.get('byes',0) - extras.get('legbyes',0) - extras.get('penalty',0)
                    if 'wides' not in extras and 'noballs' not in extras: ws['ballsBowled'] += 1
                    for wicket in d.get('wickets',[]):
                        out=wicket['kind']
                        scope[person_id(wicket['player_out'])]['outs'] += 1
                        for fielder in wicket.get('fielders',[]): person_id(fielder['name'])
                        if out not in ('run out','retired hurt','obstructing the field','retired out'):
                            ws['wickets'] += 1

def shape(stats):
    result=[]
    for name,s in stats.items():
        b=s['balls']; outs=s['outs']; bb=s['ballsBowled']; w=s['wickets']
        result.append({'name':preferred_name(name),'matches':s['matches'],'runs':s['runs'],'inningsBalls':b,'outs':outs,'average':round(s['runs']/outs,2) if outs else None,'strikeRate':round(100*s['runs']/b,2) if b else None,'fours':s['fours'],'sixes':s['sixes'],'wickets':w,'conceded':s['conceded'],'overs':round(bb/6,1),'economy':round(s['conceded']*6/bb,2) if bb else None,'bowlingAverage':round(s['conceded']/w,2) if w else None})
    return sorted(result,key=lambda x:(-x['runs'],x['name']))

out={'source':'Cricsheet IPL JSON, downloaded 2026-10-12','license':'ODC Attribution License','matches':sum(season_matches.values()),'seasons':[{'year':int(y),'matches':season_matches[y],'players':shape(season_stats[y])} for y in sorted(season_stats)],'players':shape(all_stats)}
path=pathlib.Path('packages/client/src/data/ipl-stats.json');path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(out,separators=(',',':')))
shared_stats=pathlib.Path('packages/shared/src/ipl-stats.json');shared_stats.write_text(json.dumps(out,separators=(',',':')))
player_path=pathlib.Path('packages/shared/src/players.json')
pool=json.loads(player_path.read_text())
season_2026=next(s for s in out['seasons'] if s['year']==2026)['players']
names=[p['name'] for p in season_2026]
names.extend(p['name'] for p in out['players'] if p['name'] not in set(names))
if len(pool) > len(names): raise ValueError(f'Only {len(names)} real player names are available for {len(pool)} auction slots')
current_by_name={p['name']:p for p in season_2026}
career_by_name={p['name']:p for p in out['players']}
for player,name in zip(pool,names):
    player['name']=name
    stats=current_by_name.get(name)
    scope='IPL 2026'
    if stats is None:
        stats=career_by_name[name]
        scope='IPL CAREER'
    player['stats']={key:stats[key] for key in ('matches','runs','average','strikeRate','wickets','economy')}
    player['stats']['scope']=scope
    rating=round(50+40*min(1,stats['runs']/900)+10*min(1,stats['wickets']/35))
    player['rating']=max(50,min(100,rating))
    player['basePrice']=200 if rating>=90 else 100 if rating>=80 else 50 if rating>=68 else 20
player_path.write_text(json.dumps(pool,indent=2,ensure_ascii=False)+'\n')
print(f"{out['matches']} matches, {len(out['players'])} players, {len(out['seasons'])} seasons, {path.stat().st_size:,} bytes")
