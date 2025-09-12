/**
 * AIMS 공통 컴포넌트 테스트 페이지
 * Phase 2 검증용 컴포넌트 쇼케이스
 */

import React, { useState } from 'react';
import { Button, Input, Card, Badge } from './common';

const ComponentShowcase = () => {
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(3);

  const handleLoadingDemo = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <div className="p-xl max-w-6xl mx-auto">
      <h1>AIMS 공통 컴포넌트 테스트</h1>
      <p>Phase 2에서 구축한 공통 컴포넌트들을 테스트합니다.</p>

      {/* Button 테스트 */}
      <Card title="Button 컴포넌트" className="mb-xl">
        <div className="flex gap-md flex-wrap mb-lg">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="success">Success</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
        
        <div className="flex gap-md flex-wrap mb-lg">
          <Button size="small">Small</Button>
          <Button size="default">Default</Button>
          <Button size="large">Large</Button>
        </div>

        <div className="flex gap-md flex-wrap">
          <Button loading={loading} onClick={handleLoadingDemo}>
            {loading ? 'Loading...' : 'Click me!'}
          </Button>
          <Button disabled>Disabled</Button>
        </div>
      </Card>

      {/* Input 테스트 */}
      <Card title="Input 컴포넌트" className="mb-xl">
        <div className="flex-column gap-lg">
          <Input 
            placeholder="기본 입력" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            allowClear
          />
          <Input size="small" placeholder="Small 크기" />
          <Input size="large" placeholder="Large 크기" />
          <Input status="error" placeholder="오류 상태" />
          <Input status="warning" placeholder="경고 상태" />
          <Input status="success" placeholder="성공 상태" />
          <Input disabled placeholder="비활성 상태" />
          <Input 
            prefix="🔍" 
            suffix="개"
            placeholder="접두사/접미사"
          />
        </div>
      </Card>

      {/* Card 테스트 */}
      <div className="grid grid-cols-auto-fit gap-lg mb-xl showcase-grid">
        <Card title="기본 카드">
          <p>기본 카드 내용입니다.</p>
        </Card>

        <Card title="호버 카드" hoverable onClick={() => alert('카드 클릭!')}>
          <p>마우스를 올려보고 클릭해보세요.</p>
        </Card>

        <Card title="로딩 카드" loading>
          <p>로딩 중...</p>
        </Card>

        <Card 
          title="Extra 있는 카드" 
          extra={<Button size="small">더보기</Button>}
        >
          <p>헤더에 추가 요소가 있는 카드입니다.</p>
        </Card>
      </div>

      {/* Badge 테스트 */}
      <Card title="Badge 컴포넌트">
        <div className="flex-column gap-xl">
          {/* 상태 배지 */}
          <div>
            <h4>상태 배지:</h4>
            <div className="flex gap-lg flex-wrap">
              <Badge status="success" text="완료" />
              <Badge status="processing" text="처리중" />
              <Badge status="error" text="오류" />
              <Badge status="warning" text="경고" />
              <Badge status="default" text="기본" />
            </div>
          </div>

          {/* 카운트 배지 */}
          <div>
            <h4>카운트 배지:</h4>
            <div className="flex gap-xl align-center flex-wrap">
              <Badge count={count}>
                <div className="badge-demo-icon">
                  📧
                </div>
              </Badge>
              
              <Badge count={99}>
                <div className="badge-demo-icon">
                  🔔
                </div>
              </Badge>

              <Badge count={1000} overflowCount={999}>
                <div className="badge-demo-icon">
                  💬
                </div>
              </Badge>

              <Badge dot>
                <div className="badge-demo-icon">
                  🎯
                </div>
              </Badge>
            </div>

            <div className="counter-controls">
              <Button size="small" onClick={() => setCount(Math.max(0, count - 1))}>
                -
              </Button>
              <span className="counter-display">Count: {count}</span>
              <Button size="small" onClick={() => setCount(count + 1)}>
                +
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* 검증 체크리스트 */}
      <Card title="✅ Phase 2 검증 체크리스트" className="checklist-card">
        <ul className="checklist-content">
          <li>✅ Button: 5가지 variant가 모두 다른 색상으로 표시됨</li>
          <li>✅ Button: 3가지 size가 크기 차이 있음</li>
          <li>✅ Button: Loading 상태에서 스피너가 돔</li>
          <li>✅ Button: Hover 효과 (살짝 위로 움직임)</li>
          <li>✅ Input: Clear 버튼이 작동함</li>
          <li>✅ Input: 상태별로 다른 색상의 테두리</li>
          <li>✅ Input: Focus 시 파란색 테두리</li>
          <li>✅ Card: 호버 카드는 마우스 올리면 그림자 효과</li>
          <li>✅ Card: 로딩 카드는 스켈레톤 애니메이션</li>
          <li>✅ Badge: 상태별 색상 점이 다름</li>
          <li>✅ Badge: 카운트 증감이 실시간 반영</li>
          <li>✅ 모든 색상이 CSS Variables 사용 (하드코딩 없음)</li>
        </ul>
      </Card>
    </div>
  );
};

export default ComponentShowcase;