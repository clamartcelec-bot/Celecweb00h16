import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createJournal, runNetworkRecipe, validateConfig, type Fixture, type Journal, type RecipeConfig } from './carnet-network-core.ts';

const args=process.argv.slice(2);
const value=(flag:string)=>{const i=args.indexOf(flag);return i>=0?args[i+1]:undefined;};
const help=`Recette réseau Carnet — à exécuter uniquement par l’opérateur Bolt autorisé.
Usage : npm run check:carnet-network -- --live --fixtures CHEMIN.json --journal journal.json --report rapport.json [--publication]
Variables locales : CARNET_PROJECT_URL, CARNET_PUBLIC_KEY, CARNET_ADMIN_TOKEN ; CARNET_CLIENT_TOKEN recommandé.
Aucune clé serveur. Sans --live, aucune requête n’est effectuée. Le journal ne contient aucun jeton.
--publication publie brièvement le seul billet créé par la recette, puis le dépublie et le supprime.
Voir docs/NETWORK_RECIPE.md. Les essais Android restent manuels.`;
async function atomicJson(path:string,value:unknown) {
  await mkdir(dirname(path),{recursive:true});await writeFile(`${path}.part`,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(`${path}.part`,path);
}
async function main(){
  if(args.includes('--help')||!args.includes('--live')){process.stdout.write(help+'\n');return;}
  const fixturesPath=value('--fixtures'),journalPath=value('--journal'),reportPath=value('--report');
  if(!fixturesPath||!journalPath||!reportPath)throw new Error('arguments_missing');
  const paths=[fixturesPath,journalPath,reportPath].map(p=>resolve(p));
  if(new Set(paths).size!==3||paths.some(p=>paths.includes(`${p}.part`)))throw new Error('output_paths_overlap');
  const config:RecipeConfig={origin:process.env.CARNET_PROJECT_URL||'',publicKey:process.env.CARNET_PUBLIC_KEY||'',
    adminToken:process.env.CARNET_ADMIN_TOKEN||'',clientToken:process.env.CARNET_CLIENT_TOKEN,mode:'live',publication:args.includes('--publication')};
  validateConfig(config);
  config.origin=new URL(config.origin).origin;
  const input=JSON.parse(await readFile(paths[0],'utf8'));
  if(!Array.isArray(input.files)||input.files.length!==5)throw new Error('mixed_fixture_required');
  const fixtures:Fixture[]=[];
  for(const f of input.files){
    const path=resolve(dirname(paths[0]),f.path);
    if(paths.slice(1).some(output=>path===output||path===`${output}.part`))throw new Error('fixture_output_overlap');
    if((await stat(path)).size>25*1024*1024)throw new Error('fixture_too_large');
    fixtures.push({bytes:await readFile(path),type:f.type,mime_type:f.mime_type,...(f.duration_ms===undefined?{}:{duration_ms:f.duration_ms})});
  }
  let journal:Journal;
  try{journal=JSON.parse(await readFile(paths[1],'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;journal=createJournal(config.origin,fixtures,input.text);await atomicJson(paths[1],journal);}
  const report=await runNetworkRecipe(config,fixtures,journal,{save:j=>atomicJson(paths[1],j)});
  await atomicJson(paths[2],report);process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.success)process.exitCode=1;
}
main().catch(()=>{process.stderr.write('Recette non exécutée ou interrompue. Vérifiez les paramètres locaux et les fichiers ; aucun secret n’est affiché.\n');process.exitCode=1;});
