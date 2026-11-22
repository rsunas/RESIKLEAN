import { wasteCategoryLabel } from '@/lib/waste-categories';
import { ResidentAvatar } from './resident-avatar';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, LayoutAnimation, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import { Image } from 'expo-image';
import { AccordionBody, MotionChevron, MotionModal, MotionPressable as Pressable } from '@/components/app-motion';
import { SkeletonBlock, SkeletonRows } from '@/components/loading-skeleton';
import { useAppReducedMotion } from '@/hooks/use-app-reduced-motion';

type Report = { wasteCategory?: string; _id: string; status: string; createdAt: string; barangay: string; photoUrl?: string | null; aiVerified?: boolean; aiConfidence?: number };
type Message = { _id: string; body: string; createdAt: string; senderRole: string; senderId?: string | {name?: string} };
type Props = { residentName?: string; residentPhoto?: string; report: Report; subject: string; body: string; bags: string; metadata: string; messages: Message[]; loading: boolean; sending: boolean; error: string; draft: string; setDraft: (value: string) => void; send: () => Promise<void>; onClose: () => void; bottomInset: number };
export const reportStep = (status: string) => status === 'resolved' ? 2 : status === 'verified' || status === 'scheduled' ? 1 : 0;
const stages = ['Submitted', 'Acknowledged\nScheduled', 'Resolved'];
const date = (value: string, time = false) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : parsed.toLocaleString('en-PH', time ? {hour:'numeric',minute:'2-digit'} : {month:'short',day:'numeric',year:'numeric'}); };

export function ResidentComplaintConversation({residentName = 'Resident',residentPhoto,report,subject,body,bags,metadata,messages,loading,sending,error,draft,setDraft,send,onClose,bottomInset}: Props) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [pending, setPending] = useState<{body: string; state: 'sending' | 'failed'} | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  useEffect(() => { setDetailsExpanded(true); setMetadataExpanded(false); }, [report._id]);
  const reduced = useAppReducedMotion();
  const thread = useRef<ScrollView>(null);
  const scrollNeeded = useRef(true);
  const current = reportStep(report.status);
  const rejected = report.status === 'rejected';
  const resolved = report.status === 'resolved';
  const statusLabel = resolved ? 'Resolved' : rejected ? 'Rejected' : current === 1 ? 'Acknowledged / Scheduled' : 'Pending';
  useEffect(() => {
    const update = (open: boolean) => {
      if (!reduced) LayoutAnimation.configureNext({duration:150,update:{type:LayoutAnimation.Types.easeInEaseOut}});
      setKeyboardOpen(open);
      scrollNeeded.current = true;
    };
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => update(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => update(false));
    return () => {show.remove();hide.remove();};
  }, [reduced]);
  useEffect(() => { scrollNeeded.current = true; thread.current?.scrollToEnd({animated:false}); }, [messages.length, messages.at(-1)?._id, loading, pending]);
  useEffect(() => {
    if (!sending && pending?.state === 'sending') {
      if (error) setPending(value => value ? {...value,state:'failed'} : null);
      else if (!draft) setPending(null);
    }
  }, [sending,error,draft,pending?.state]);
  const submit = () => { if (!draft.trim() || sending) return; setPending({body:draft.trim(),state:'sending'}); void send(); };
  const scrollToLatest = () => {if (scrollNeeded.current) {thread.current?.scrollToEnd({animated:false});scrollNeeded.current=false;}};
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheet}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to complaints" onPress={onClose} style={s.back}><Feather name="chevron-left" size={24} color="#086B42" /></Pressable>
      <View style={s.heading}><Text style={s.eyebrow}>SWMO SUPPORT</Text>{loading ? <SkeletonBlock height={26} width="90%" /> : <Text numberOfLines={1} ellipsizeMode="tail" style={s.subject}>{subject}</Text>}
      {!keyboardOpen ? <View style={[s.status,resolved && s.statusResolved,rejected && s.statusRejected]}><View style={[s.statusDot,resolved && s.green,rejected && s.red]} /><Text style={[s.statusText,resolved && s.greenText,rejected && s.redText]}>{statusLabel}</Text></View> : null}
      </View>
    </View>
    <View style={[s.trackerWrap, scrolled && s.trackerBorder]}>
      <View style={[s.tracker,keyboardOpen && s.compactTracker]}>
        {keyboardOpen ? <><View style={s.segments}>{stages.map((stage,index) => <View key={stage} style={[s.segment,index <= current && !rejected && s.green]} />)}</View><Text style={s.compactLabel}>{rejected ? 'Rejected' : stages[current]}</Text></> : <>
          <Text style={s.trackerTitle}>STATUS TRACKER</Text>
          {rejected ? <Text style={s.redText}>This report was rejected.</Text> : <View style={s.steps}>{stages.map((stage,index) => <View key={stage} style={[s.step,index === 1 && s.middleStep]}>
            {index < 2 ? <View style={[s.connector,{width:index === 0 ? '125%' : '83.333%'},index < current && s.green]} /> : null}
            <View style={[s.circle,index <= current && s.green]}>{index <= current ? <Feather name="check" color="white" size={14} /> : null}</View>
            <Text style={[s.stepLabel,index <= current && s.completedLabel]}>{stage}</Text>
          </View>)}</View>}
        </>}
      </View>
    </View>
    <ScrollView ref={thread} style={s.thread} contentContainerStyle={s.threadContent} keyboardShouldPersistTaps="handled" onContentSizeChange={scrollToLatest} onLayout={scrollToLatest} onScroll={event => setScrolled(event.nativeEvent.contentOffset.y > 1)} scrollEventThrottle={32}>
      <View style={s.detailsGroup}>
      <Pressable accessibilityRole="button" accessibilityLabel="Complaint details" accessibilityState={{expanded:detailsExpanded}} onPress={() => setDetailsExpanded(value => !value)} style={s.disclosure}>
        <Text style={s.disclosureTitle}>Complaint details</Text><MotionChevron expanded={detailsExpanded}><Feather name="chevron-down" size={20} color="#0A7F4F"/></MotionChevron>
      </Pressable>
      <AccordionBody expanded={detailsExpanded}>
      <View style={s.details}>
        <Feather name="map-pin" color="#0A7F4F" size={18}/><View style={s.detailCopy}><Text style={s.detailLabel}>Location</Text><Text style={s.detailValue}>{report.barangay || 'Not recorded'}</Text></View>
      </View>
      <View style={s.details}>
        <MaterialCommunityIcons name="sack-outline" color="#0A7F4F" size={18}/><View style={s.detailCopy}><Text style={s.detailLabel}>Detected bag count</Text><Text style={s.detailValue}>{bags}</Text></View>
      </View>
      <View style={s.details}><Feather name="tag" color="#0A7F4F" size={18}/><View style={s.detailCopy}><Text style={s.detailLabel}>Waste category</Text><Text style={s.detailValue}>{wasteCategoryLabel(report.wasteCategory)}</Text></View></View>
      </AccordionBody>
      </View>
      <Text style={s.date}>{date(report.createdAt)}</Text>
      <View style={[s.bubble,s.own,{width:'100%'}]}>
        <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8}}><ResidentAvatar name={residentName} uri={residentPhoto} size={32}/><Text style={s.sender}>You</Text></View><Text style={s.messageSubject}>{subject}</Text>{body && body !== subject ? <Text style={s.messageBody}>{body}</Text> : null}
        {report.photoUrl ? <View style={s.photoWrap}><Image accessibilityLabel="Submitted waste photo" source={{uri:report.photoUrl}} contentFit="cover" style={s.photo}/>
          {report.aiVerified ? <View accessibilityLabel={typeof report.aiConfidence === 'number' ? `AI verified, ${Math.round(report.aiConfidence * 100)} percent match` : 'AI verified'} style={s.verified}><Feather name="check" size={14} color="white"/></View> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Expand complaint photo" onPress={() => setPhotoOpen(true)} style={s.expand}><Feather name="maximize" size={18} color="white"/></Pressable></View> : <Text style={s.meta}>Submitted photo unavailable</Text>}
        {metadata ? <View><Pressable accessibilityRole="button" accessibilityLabel="Photo metadata" accessibilityState={{expanded:metadataExpanded}} onPress={() => setMetadataExpanded(value => !value)} style={s.disclosure}><Text style={s.disclosureTitle}>Photo metadata</Text><MotionChevron expanded={metadataExpanded}><Feather name="chevron-down" size={18} color="#0A7F4F"/></MotionChevron></Pressable><AccordionBody expanded={metadataExpanded}><Text style={s.meta}>{metadata}</Text></AccordionBody></View> : null}<Text style={s.time}>{date(report.createdAt,true)}</Text>
      </View>
      {loading ? <SkeletonRows kind="chat" count={3}/> : <>
        {!messages.some(message => message.senderRole !== 'resident') ? <Text style={s.empty}>No messages yet. Send a message to the collection team.</Text> : null}
        {messages.map(message => {const own=message.senderRole==='resident';const sender=message.senderId && typeof message.senderId==='object' ? message.senderId.name || 'Collection team' : 'Collection team';return <View key={message._id} style={[s.messageRow,own && s.ownRow]}>
          {own ? <ResidentAvatar name={residentName} uri={residentPhoto} size={32}/> : <View style={s.avatar}><Text style={s.avatarText}>{sender.charAt(0).toUpperCase()}</Text></View>}
          <View style={[s.bubble,own ? s.own : s.reply]}><Text style={s.sender}>{own ? 'You' : sender}</Text><Text style={s.messageBody}>{message.body}</Text><Text style={s.time}>{date(message.createdAt,true)}</Text></View>
        </View>;})}
      </>}
      {pending ? <View style={[s.bubble,s.own]}><Text style={s.sender}>You</Text><Text style={s.messageBody}>{pending.body}</Text><Text accessibilityLiveRegion="polite" style={[s.time,pending.state==='failed' && s.redText]}>{pending.state==='failed' ? 'Failed to send. Your message is kept below.' : 'Sending...'}</Text></View> : null}
      {error ? <Text accessibilityRole="alert" style={s.redText}>{error}</Text> : null}
    </ScrollView>
    <View style={[s.composer,{paddingBottom:keyboardOpen ? 12 : Math.max(28,bottomInset + 12)}]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Attachments unavailable. Messages currently support text only." accessibilityState={{disabled:true}} disabled style={s.attach}><Feather name="paperclip" size={22} color="#5A6761"/></Pressable>
      <TextInput accessibilityLabel="Message collection team" multiline maxLength={1000} value={draft} onChangeText={setDraft} placeholder="Write a message..." selectionColor="#0A7F4F" placeholderTextColor="#5A6761" style={s.input}/>
      <Pressable accessibilityRole="button" accessibilityLabel={sending ? 'Sending message' : 'Send message'} disabled={sending || !draft.trim()} onPress={submit} style={[s.send,(sending || !draft.trim()) && s.disabled]}><Feather name="send" size={22} color="white"/></Pressable>
    </View>
    <MotionModal transparent visible={photoOpen} onRequestClose={() => setPhotoOpen(false)} animationType="fade"><View style={s.lightbox}><Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={() => setPhotoOpen(false)} style={s.photoClose}><Feather name="x" color="white" size={24}/></Pressable>{report.photoUrl ? <Image source={{uri:report.photoUrl}} contentFit="contain" accessibilityLabel="Full complaint photo" style={s.fullPhoto}/> : null}</View></MotionModal>
  </KeyboardAvoidingView>;
}
const s=StyleSheet.create({
 sheet:{flex:1,maxHeight:'90%',backgroundColor:'white',borderTopLeftRadius:24,borderTopRightRadius:24,overflow:'hidden'},
 header:{flexDirection:'row',alignItems:'center',gap:8,paddingTop:16,paddingBottom:12,paddingLeft:8,paddingRight:16,flexShrink:0},back:{width:44,height:44,alignItems:'center',justifyContent:'center'},heading:{flex:1,minWidth:0,gap:4},eyebrow:{color:'#0A7F4F',fontSize:11,fontWeight:'700',letterSpacing:1.32},subject:{color:'#121A16',fontSize:24,fontWeight:'700'},
 status:{backgroundColor:'#E8F0FE',borderRadius:10,paddingVertical:6,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:6,alignSelf:'flex-start',maxWidth:'100%',marginTop:4},statusText:{fontSize:13,lineHeight:19,fontWeight:'600',color:'#1A56C4',flexShrink:1},statusDot:{width:7,height:7,borderRadius:4,backgroundColor:'#1A56C4',flexShrink:0},statusResolved:{backgroundColor:'#E3F4EB'},statusRejected:{backgroundColor:'#FCEAE8'},green:{backgroundColor:'#0A7F4F'},red:{backgroundColor:'#B3261E'},greenText:{color:'#086B42'},redText:{color:'#B3261E',fontSize:13},
 trackerWrap:{paddingHorizontal:20,paddingBottom:12,borderBottomWidth:1,borderBottomColor:'transparent',flexShrink:0},trackerBorder:{borderBottomColor:'#E3EAE6'},tracker:{paddingTop:14,paddingHorizontal:12,paddingBottom:12,borderRadius:20,backgroundColor:'#F4F6F5'},trackerTitle:{color:'#5A6761',fontSize:11,fontWeight:'700',letterSpacing:1.1,marginBottom:12},steps:{flexDirection:'row'},step:{flex:1,alignItems:'center'},middleStep:{flex:1.5},circle:{width:25,height:25,borderRadius:13,backgroundColor:'#E8EDEA',alignItems:'center',justifyContent:'center'},connector:{height:3,position:'absolute',left:'50%',width:'100%',top:11,backgroundColor:'#DCE4DF'},stepLabel:{color:'#5A6761',fontSize:12,lineHeight:18,fontWeight:'500',textAlign:'center',marginTop:8,paddingHorizontal:2},completedLabel:{fontWeight:'700',color:'#121A16'},compactTracker:{minHeight:44,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:12},segments:{flexDirection:'row',gap:4,flex:1},segment:{height:6,flex:1,borderRadius:3,backgroundColor:'#DCE4DF'},compactLabel:{color:'#35463F',fontSize:13,fontWeight:'600',flexShrink:1,maxWidth:'65%'},
 detailsGroup:{borderRadius:18,backgroundColor:'#F4F6F5',overflow:'hidden'},disclosure:{minHeight:44,paddingHorizontal:14,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:8},disclosureTitle:{flex:1,fontSize:13,fontWeight:'600',color:'#35463F'},
 thread:{flex:1,minHeight:0},threadContent:{paddingHorizontal:20,paddingTop:12,paddingBottom:16,gap:12},details:{paddingVertical:12,paddingHorizontal:14,borderRadius:18,backgroundColor:'#F4F6F5',flexDirection:'row',alignItems:'center',gap:10},detailCell:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:8},detailCopy:{flex:1,minWidth:0},detailLabel:{fontSize:11,color:'#5A6761'},detailValue:{fontSize:14,fontWeight:'700',color:'#121A16',marginTop:3},detailDivider:{width:1,alignSelf:'stretch',backgroundColor:'#DCE4DF'},date:{fontSize:12,color:'#5A6761',textAlign:'center'},
 bubble:{maxWidth:300,paddingVertical:12,paddingHorizontal:14,borderRadius:18,minWidth:0,flexShrink:1},own:{alignSelf:'flex-end',backgroundColor:'#E3F4EB',borderBottomRightRadius:6},reply:{backgroundColor:'#F1F5F3',borderBottomLeftRadius:6},sender:{fontSize:12,fontWeight:'700',color:'#086B42',marginBottom:4},messageSubject:{fontSize:15,fontWeight:'700',color:'#121A16'},messageBody:{fontSize:15,color:'#121A16',lineHeight:22},time:{fontSize:12,color:'#5A6761',textAlign:'right',marginTop:8},photoWrap:{marginTop:12},photo:{width:'100%',height:150,borderRadius:12},expand:{position:'absolute',right:8,bottom:8,width:36,height:36,borderRadius:18,backgroundColor:'#18352CDD',alignItems:'center',justifyContent:'center'},verified:{position:'absolute',top:8,left:8,width:24,height:24,borderRadius:12,backgroundColor:'#0A7F4F',alignItems:'center',justifyContent:'center'},meta:{fontSize:11,color:'#4B5A53',lineHeight:16,marginTop:8},empty:{fontSize:13,color:'#5A6761',textAlign:'center',paddingVertical:8},messageRow:{flexDirection:'row',alignItems:'flex-end',gap:8},ownRow:{justifyContent:'flex-end'},avatar:{width:36,height:36,borderRadius:18,backgroundColor:'#0A7F4F',alignItems:'center',justifyContent:'center'},avatarText:{color:'white',fontWeight:'700',fontSize:14},
 composer:{flexDirection:'row',alignItems:'flex-end',gap:8,paddingTop:12,paddingHorizontal:16,borderTopWidth:1,borderTopColor:'#E3EAE6',flexShrink:0},attach:{width:44,height:48,alignItems:'center',justifyContent:'center',opacity:0.45},input:{flex:1,minWidth:0,minHeight:48,maxHeight:112,borderRadius:24,backgroundColor:'#F1F5F3',fontSize:15,paddingHorizontal:16,paddingVertical:12,color:'#121A16'},send:{width:48,height:48,borderRadius:24,backgroundColor:'#0A7F4F',alignItems:'center',justifyContent:'center'},disabled:{opacity:0.45},lightbox:{flex:1,backgroundColor:'#0D1E18F2',padding:20},photoClose:{height:44,width:44,alignItems:'center',justifyContent:'center',alignSelf:'flex-end',marginTop:40},fullPhoto:{flex:1,width:'100%'},
});
